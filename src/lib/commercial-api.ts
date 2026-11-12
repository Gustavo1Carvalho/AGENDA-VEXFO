/**
 * Acesso ao banco (Lovable Cloud / Supabase) dos módulos Negociações e Upgrades.
 * Toda leitura/escrita passa por aqui; as telas não chamam o Supabase diretamente.
 * As permissões são garantidas pela RLS (somente administradores).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  onlyDigits,
  type Client,
  type Negotiation,
  type NegotiationContact,
  type NegotiationStatus,
  type PlanUpgrade,
  type ProfileOption,
} from "@/lib/commercial";

export type ClientInput = {
  name: string;
  client_code: string;
  cpf: string;
  phone: string;
  address: string;
  neighborhood: string;
};

export type NegotiationInput = {
  current_plan: string;
  interested_plan: string;
  status: NegotiationStatus;
  reason: string;
  responsible_id: string;
  registered_on: string;
  next_contact_on: string;
  notes: string;
};

export type UpgradeInput = {
  previous_plan: string;
  new_plan: string;
  previous_value: number;
  new_value: number;
  upgrade_date: string;
  responsible_id: string;
  notes: string;
};

export type ContactInput = {
  negotiation_id: string;
  contact_type: string;
  description: string;
  contacted_at: string;
};

const PAGE = 1000;
const orNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

/** Escapa curingas do ILIKE para comparação exata sem diferenciar maiúsculas. */
const ilikeExact = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Busca todas as linhas, paginando de 1000 em 1000 (limite padrão da API). */
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

function clientPayload(input: ClientInput) {
  return {
    name: input.name.trim(),
    client_code: orNull(input.client_code),
    cpf: orNull(onlyDigits(input.cpf)),
    phone: orNull(input.phone),
    address: orNull(input.address),
    neighborhood: orNull(input.neighborhood),
  };
}

export const commercialApi = {
  async currentUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  },

  /** Usuários do sistema (para o campo "Responsável"). Administradores enxergam todos os perfis. */
  async listProfiles(): Promise<ProfileOption[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name");
    if (error) throw error;
    return (data ?? []).filter((p) => p.full_name?.trim()) as ProfileOption[];
  },

  /* ---------------- Clientes ---------------- */

  async listClients(): Promise<Client[]> {
    return fetchAll<Client>((from, to) =>
      supabase.from("clients").select("*").order("name").range(from, to),
    );
  },

  /** Procura cliente existente pelo código (sem diferenciar maiúsculas) ou pelo CPF. */
  async findClient(by: { code?: string; cpf?: string }): Promise<Client | null> {
    const code = (by.code ?? "").trim();
    const cpf = onlyDigits(by.cpf);
    if (code) {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .ilike("client_code", ilikeExact(code))
        .limit(1);
      if (error) throw error;
      if (data?.[0]) return data[0];
    }
    if (cpf.length === 11) {
      const { data, error } = await supabase.from("clients").select("*").eq("cpf", cpf).limit(1);
      if (error) throw error;
      if (data?.[0]) return data[0];
    }
    return null;
  },

  /**
   * Garante um único cadastro por cliente: reutiliza o cliente encontrado pelo
   * código/CPF, ou o cliente escolhido na busca / do registro em edição, e
   * atualiza seus dados; só cria um novo quando não existe nenhum correspondente.
   * `keepExisting`: ao atualizar, não apaga campos que o formulário não informou
   * (usado por formulários que só exibem nome e número do contrato).
   */
  async resolveClient(
    input: ClientInput,
    preferredClientId?: string | null,
    opts: { keepExisting?: boolean } = {},
  ): Promise<Client> {
    const payload = clientPayload(input);
    const existing = await commercialApi.findClient({
      code: payload.client_code ?? "",
      cpf: payload.cpf ?? "",
    });
    const targetId = existing?.id ?? preferredClientId ?? null;
    if (targetId) {
      const changes = opts.keepExisting
        ? Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null))
        : payload;
      const { data, error } = await supabase
        .from("clients")
        .update(changes)
        .eq("id", targetId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await supabase.from("clients").insert(payload).select("*").single();
    if (error) throw error;
    return data;
  },

  /* ---------------- Negociações ---------------- */

  async listNegotiations(): Promise<Negotiation[]> {
    return fetchAll<Negotiation>(
      (from, to) =>
        supabase
          .from("negotiations")
          .select("*, client:clients(*)")
          .order("registered_on", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{
          data: Negotiation[] | null;
          error: unknown;
        }>,
    );
  },

  async saveNegotiation(
    client: ClientInput,
    input: NegotiationInput,
    existing?: Negotiation | null,
    clientId?: string | null,
  ) {
    const c = await commercialApi.resolveClient(client, clientId ?? existing?.client_id);
    const payload = {
      client_id: c.id,
      current_plan: orNull(input.current_plan),
      interested_plan: orNull(input.interested_plan),
      status: input.status,
      reason: input.reason.trim(),
      responsible_id: input.responsible_id || null,
      registered_on: input.registered_on,
      next_contact_on: input.next_contact_on || null,
      notes: orNull(input.notes),
    };
    const query = existing
      ? supabase.from("negotiations").update(payload).eq("id", existing.id)
      : supabase.from("negotiations").insert(payload);
    const { error } = await query;
    if (error) throw error;
  },

  async setNegotiationStatus(id: string, status: NegotiationStatus) {
    const { error } = await supabase.from("negotiations").update({ status }).eq("id", id);
    if (error) throw error;
  },

  async setNextContact(id: string, date: string | null) {
    const { error } = await supabase
      .from("negotiations")
      .update({ next_contact_on: date || null })
      .eq("id", id);
    if (error) throw error;
  },

  async deleteNegotiation(id: string) {
    const { error } = await supabase.from("negotiations").delete().eq("id", id);
    if (error) throw error;
  },

  async listContacts(negotiationId: string): Promise<NegotiationContact[]> {
    const { data, error } = await supabase
      .from("negotiation_contacts")
      .select("*")
      .eq("negotiation_id", negotiationId)
      .order("contacted_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async addContact(input: ContactInput) {
    const { error } = await supabase.from("negotiation_contacts").insert({
      negotiation_id: input.negotiation_id,
      contact_type: input.contact_type,
      description: input.description.trim(),
      contacted_at: input.contacted_at,
    });
    if (error) throw error;
  },

  /* ---------------- Upgrades ---------------- */

  async listUpgrades(): Promise<PlanUpgrade[]> {
    return fetchAll<PlanUpgrade>(
      (from, to) =>
        supabase
          .from("plan_upgrades")
          .select("*, client:clients(*)")
          .order("upgrade_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{
          data: PlanUpgrade[] | null;
          error: unknown;
        }>,
    );
  },

  /** A diferença de mensalidade NÃO é enviada: o banco calcula (coluna gerada). */
  async saveUpgrade(
    client: ClientInput,
    input: UpgradeInput,
    existing?: PlanUpgrade | null,
    clientId?: string | null,
  ) {
    const c = await commercialApi.resolveClient(client, clientId ?? existing?.client_id);
    const payload = {
      client_id: c.id,
      previous_plan: input.previous_plan.trim(),
      new_plan: input.new_plan.trim(),
      previous_value: input.previous_value,
      new_value: input.new_value,
      upgrade_date: input.upgrade_date,
      responsible_id: input.responsible_id || null,
      notes: orNull(input.notes),
    };
    const query = existing
      ? supabase.from("plan_upgrades").update(payload).eq("id", existing.id)
      : supabase.from("plan_upgrades").insert(payload);
    const { error } = await query;
    if (error) throw error;
  },

  async deleteUpgrade(id: string) {
    const { error } = await supabase.from("plan_upgrades").delete().eq("id", id);
    if (error) throw error;
  },

  /* ---------------- Sincronização entre usuários ---------------- */

  /** Recarrega a tela quando outro usuário altera alguma das tabelas (Supabase Realtime). */
  subscribe(channelName: string, tables: string[], onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, 250);
    };
    let channel = supabase.channel(`${channelName}-${Math.random().toString(36).slice(2, 8)}`);
    for (const table of tables) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, debounced);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  },
};

export type CommercialApi = typeof commercialApi;
