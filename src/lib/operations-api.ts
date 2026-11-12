/**
 * Acesso ao banco (Lovable Cloud / Supabase) de Indicações, Cancelamentos e
 * Motivo da troca de roteador. Permissões garantidas pela RLS.
 */
import { supabase } from "@/integrations/supabase/client";
import { commercialApi, type ClientInput } from "@/lib/commercial-api";
import type { Cancellation, Referral, ReferralStatus, RouterSwap } from "@/lib/operations";
import type { ServiceOrder } from "@/lib/orders";

const PAGE = 1000;
const orNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export type ReferralInput = {
  agent_id: string;
  referred_name: string;
  referred_phone: string;
  referred_on: string;
  status: ReferralStatus;
  contracted_plan: string;
  new_contract_number: string;
  contracted_on: string;
};

export type CancellationInput = {
  current_plan: string;
  cancelled_on: string;
  agent_id: string;
  reason: string;
  notes: string;
};

export type RouterSwapInput = {
  reason: string;
  reason_other: string;
  notes: string;
  contract_number: string;
};

export const operationsApi = {
  /* ---------------- Indicações ---------------- */

  async listReferrals(): Promise<Referral[]> {
    return fetchAll<Referral>(
      (from, to) =>
        supabase
          .from("referrals")
          .select("*, referrer:clients(*)")
          .order("referred_on", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Referral[] | null; error: unknown }>,
    );
  },

  /**
   * Cadastra ou atualiza a indicação (alterar o status atualiza o MESMO registro).
   * Os dados de contratação ficam guardados mesmo se o status voltar para "Não contratou".
   */
  async saveReferral(
    referrer: ClientInput,
    input: ReferralInput,
    existing?: Referral | null,
    clientId?: string | null,
  ) {
    const c = await commercialApi.resolveClient(
      referrer,
      clientId ?? existing?.referrer_client_id,
      {
        keepExisting: true,
      },
    );
    // O formulário mantém os dados de contratação carregados do registro mesmo quando ocultos,
    // então eles são preservados se o status voltar para "Não contratou".
    const payload = {
      referrer_client_id: c.id,
      agent_id: input.agent_id || null,
      referred_name: input.referred_name.trim(),
      referred_phone: input.referred_phone.trim(),
      referred_on: input.referred_on,
      status: input.status,
      contracted_plan: orNull(input.contracted_plan),
      new_contract_number: orNull(input.new_contract_number),
      contracted_on: input.contracted_on || null,
    };
    const { error } = existing
      ? await supabase.from("referrals").update(payload).eq("id", existing.id)
      : await supabase.from("referrals").insert(payload);
    if (error) throw error;
  },

  /* ---------------- Cancelamentos ---------------- */

  async listCancellations(): Promise<Cancellation[]> {
    return fetchAll<Cancellation>(
      (from, to) =>
        supabase
          .from("cancellations")
          .select("*, client:clients(*)")
          .order("cancelled_on", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{
          data: Cancellation[] | null;
          error: unknown;
        }>,
    );
  },

  /** Registro interno: não altera o contrato nem o cadastro do cliente além de nome/contrato informados. */
  async saveCancellation(
    client: ClientInput,
    input: CancellationInput,
    existing?: Cancellation | null,
    clientId?: string | null,
  ) {
    const c = await commercialApi.resolveClient(client, clientId ?? existing?.client_id, {
      keepExisting: true,
    });
    const payload = {
      client_id: c.id,
      current_plan: orNull(input.current_plan),
      cancelled_on: input.cancelled_on,
      agent_id: input.agent_id || null,
      reason: input.reason.trim(),
      notes: orNull(input.notes),
    };
    const { error } = existing
      ? await supabase.from("cancellations").update(payload).eq("id", existing.id)
      : await supabase.from("cancellations").insert(payload);
    if (error) throw error;
  },

  /** Último plano conhecido do cliente (upgrade mais recente ou negociação), para pré-preencher. */
  async lastKnownPlan(clientId: string): Promise<string | null> {
    const { data: up } = await supabase
      .from("plan_upgrades")
      .select("new_plan")
      .eq("client_id", clientId)
      .order("upgrade_date", { ascending: false })
      .limit(1);
    if (up?.[0]?.new_plan) return up[0].new_plan;
    const { data: neg } = await supabase
      .from("negotiations")
      .select("current_plan")
      .eq("client_id", clientId)
      .order("registered_on", { ascending: false })
      .limit(5);
    return neg?.find((n) => n.current_plan)?.current_plan ?? null;
  },

  /* ---------------- Motivo da troca de roteador ---------------- */

  async listRouterSwaps(orderIds?: string[]): Promise<RouterSwap[]> {
    if (orderIds && !orderIds.length) return [];
    if (orderIds) {
      const { data, error } = await supabase
        .from("router_swaps")
        .select("*")
        .in("service_order_id", orderIds);
      if (error) throw error;
      return data ?? [];
    }
    return fetchAll<RouterSwap>((from, to) =>
      supabase
        .from("router_swaps")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to),
    );
  },

  async getRouterSwap(orderId: string): Promise<RouterSwap | null> {
    const { data, error } = await supabase
      .from("router_swaps")
      .select("*")
      .eq("service_order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Grava (ou corrige) o motivo da troca da OS. */
  async saveRouterSwap(orderId: string, input: RouterSwapInput, existing?: RouterSwap | null) {
    const payload = {
      reason: input.reason,
      reason_other: input.reason === "outro" ? orNull(input.reason_other) : null,
      notes: orNull(input.notes),
      contract_number: orNull(input.contract_number),
    };
    const { error } = existing
      ? await supabase.from("router_swaps").update(payload).eq("id", existing.id)
      : await supabase.from("router_swaps").insert({ service_order_id: orderId, ...payload });
    if (error) throw error;
  },

  /** OS de troca de roteador (visão administrativa). */
  async listRouterSwapOrders(): Promise<ServiceOrder[]> {
    return fetchAll<ServiceOrder>((from, to) =>
      supabase
        .from("service_orders")
        .select("*")
        .eq("service_type", "troca_roteador")
        .order("scheduled_date", { ascending: false })
        .range(from, to),
    );
  },

  async listTechnicians(): Promise<Array<{ id: string; full_name: string }>> {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "tecnico");
    const ids = (roles ?? []).map((r) => r.user_id);
    if (!ids.length) return [];
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    return ((data ?? []) as Array<{ id: string; full_name: string }>)
      .filter((p) => p.full_name?.trim())
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
  },
};
