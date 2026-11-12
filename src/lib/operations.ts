/**
 * Regras de negócio de Indicações, Cancelamentos e Motivo da troca de roteador.
 * Funções puras — sem acesso a banco ou DOM — para facilitar testes.
 */
import type { Database } from "@/integrations/supabase/types";
import {
  clientMatchesSearch,
  matchesDayMonthYear,
  normalizeText,
  onlyDigits,
  type Client,
  type DayMonthYear,
} from "@/lib/commercial";
import type { ServiceOrder } from "@/lib/orders";

type Tables = Database["public"]["Tables"];
export type ReferralStatus = Database["public"]["Enums"]["referral_status"];
export type Referral = Tables["referrals"]["Row"] & { referrer: Client | null };
export type Cancellation = Tables["cancellations"]["Row"] & { client: Client | null };
export type RouterSwap = Tables["router_swaps"]["Row"];

/* ------------------------------------------------------------------------ */
/* Rótulos                                                                   */
/* ------------------------------------------------------------------------ */

/** Indicações: exclusivamente estes dois resultados. */
export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  contratou: "Contratou",
  nao_contratou: "Não contratou",
};
export const REFERRAL_STATUS_STYLES: Record<ReferralStatus, string> = {
  contratou: "bg-success/15 text-success border-success/30",
  nao_contratou: "bg-muted text-muted-foreground border-border",
};

/** Cancelamentos: opções iniciais (o banco aceita texto, para incluir novos motivos no futuro). */
export const CANCELLATION_REASONS = ["Insatisfação", "Cliente mudou de endereço"] as const;

export const ROUTER_SWAP_REASON_LABELS = {
  equipamento_defeito: "Equipamento com defeito",
  roteador_queimado: "Roteador queimado",
  problema_wifi: "Problema no Wi-Fi",
  funcionamento_inadequado: "Equipamento sem funcionamento adequado",
  upgrade_equipamento: "Upgrade de equipamento",
  outro: "Outro motivo",
} as const;
export type RouterSwapReason = keyof typeof ROUTER_SWAP_REASON_LABELS;
export const ROUTER_SWAP_REASONS = Object.keys(ROUTER_SWAP_REASON_LABELS) as RouterSwapReason[];
/** Filtro: OS de troca sem motivo registrado (registros anteriores à funcionalidade). */
export const NO_SWAP_REASON = "sem_motivo";

/** OS que exige o motivo da troca (troca/substituição de roteador). */
export const requiresRouterSwapReason = (o: Pick<ServiceOrder, "service_type">) =>
  o.service_type === "troca_roteador";

export function routerSwapReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "Motivo não registrado";
  return ROUTER_SWAP_REASON_LABELS[reason as RouterSwapReason] ?? reason;
}

/** Texto completo do motivo (inclui a explicação quando "Outro motivo"). */
export function routerSwapReasonText(
  s: Pick<RouterSwap, "reason" | "reason_other"> | null,
): string {
  if (!s) return "Motivo não registrado";
  if (s.reason === "outro") return `Outro motivo: ${(s.reason_other ?? "").trim()}`;
  return routerSwapReasonLabel(s.reason);
}

/** Validação do formulário do técnico. */
export function validateRouterSwap(input: { reason: string; reason_other: string }): string | null {
  if (!input.reason) return "Selecione o motivo da troca do roteador.";
  if (!(ROUTER_SWAP_REASONS as string[]).includes(input.reason)) return "Motivo inválido.";
  if (input.reason === "outro" && !input.reason_other.trim()) return "Explique o motivo da troca.";
  return null;
}

/* ------------------------------------------------------------------------ */
/* Utilidades de agregação                                                   */
/* ------------------------------------------------------------------------ */

/** Opções de mês (01–12) para os filtros. */
export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Data local (aaaa-mm-dd) de um timestamp ISO. */
export function localDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Conta por chave (agrupando grafias), do maior para o menor. */
export function countBy<T>(list: T[], labelOf: (item: T) => string | null | undefined) {
  const map = new Map<string, { label: string; count: number }>();
  for (const item of list) {
    const label = (labelOf(item) ?? "").trim();
    if (!label) continue;
    const key = normalizeText(label);
    const g = map.get(key) ?? { label, count: 0 };
    g.count++;
    map.set(key, g);
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"),
  );
}

/**
 * Histórico mensal de um ano: 12 meses com o total e, opcionalmente, quebras por grupo.
 * Ex.: monthlyHistory(indicações, i => i.referred_on, "2026", { Contrataram: i => i.status === "contratou" })
 */
export function monthlyHistory<T>(
  list: T[],
  dateOf: (item: T) => string | null | undefined,
  year: string,
  series: Record<string, (item: T) => boolean> = {},
) {
  const rows = MONTHS.map((m, i) => {
    const row: Record<string, string | number> = {
      name: `${m}/${year.slice(2)}`,
      month: String(i + 1).padStart(2, "0"),
      total: 0,
    };
    for (const k of Object.keys(series)) row[k] = 0;
    return row;
  });
  for (const item of list) {
    const d = dateOf(item);
    if (!d || d.slice(0, 4) !== year) continue;
    const row = rows[Number(d.slice(5, 7)) - 1];
    if (!row) continue;
    row.total = Number(row.total) + 1;
    for (const [k, fn] of Object.entries(series)) if (fn(item)) row[k] = Number(row[k]) + 1;
  }
  return rows;
}

export const conversionRate = (converted: number, total: number) =>
  total ? converted / total : null;
export const formatPercent = (rate: number | null) =>
  rate == null ? "—" : `${(rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const matchesAgent = (agentId: string | null, filter?: string) =>
  !filter || filter === "all" || (filter === "none" ? !agentId : agentId === filter);

/* ------------------------------------------------------------------------ */
/* Indicações                                                                */
/* ------------------------------------------------------------------------ */

export type ReferralFilters = DayMonthYear & {
  agentId?: string;
  status?: ReferralStatus | "all";
  search?: string;
};

export function filterReferrals(list: Referral[], f: ReferralFilters): Referral[] {
  const q = normalizeText(f.search);
  const digits = onlyDigits(f.search);
  return list.filter((r) => {
    if (!matchesDayMonthYear(r.referred_on, f)) return false;
    if (!matchesAgent(r.agent_id, f.agentId)) return false;
    if (f.status && f.status !== "all" && r.status !== f.status) return false;
    if (!q) return true;
    if (clientMatchesSearch(r.referrer, f.search)) return true;
    if (
      [r.referred_name, r.new_contract_number, r.contracted_plan].some((v) =>
        normalizeText(v).includes(q),
      )
    )
      return true;
    return digits.length >= 3 && onlyDigits(r.referred_phone).includes(digits);
  });
}

export function referralIndicators(list: Referral[]) {
  const contratou = list.filter((r) => r.status === "contratou").length;
  return {
    total: list.length,
    contratou,
    naoContratou: list.length - contratou,
    conversao: conversionRate(contratou, list.length),
  };
}

/** Quantidade de planos contratados por indicação (somente quem contratou). */
export const referralPlans = (list: Referral[]) =>
  countBy(
    list.filter((r) => r.status === "contratou"),
    (r) => r.contracted_plan,
  );

/** Indicações por agente, com quantas contrataram. */
export function referralsByAgent(list: Referral[], nameOf: (id: string | null) => string) {
  const map = new Map<string, { label: string; count: number; contratou: number }>();
  for (const r of list) {
    const key = r.agent_id ?? "none";
    const g = map.get(key) ?? { label: nameOf(r.agent_id), count: 0, contratou: 0 };
    g.count++;
    if (r.status === "contratou") g.contratou++;
    map.set(key, g);
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"),
  );
}

export type ReferralFormInput = {
  referred_name: string;
  referred_phone: string;
  referred_on: string;
  status: ReferralStatus | "";
  contracted_plan: string;
  new_contract_number: string;
  contracted_on: string;
};

/** Validação: Contratou exige plano, número do novo contrato e data da contratação. */
export function validateReferral(clientName: string, f: ReferralFormInput): string | null {
  if (!clientName.trim()) return "Informe o cliente que indicou.";
  if (!f.referred_name.trim()) return "Informe o nome do novo cliente.";
  if (!f.referred_phone.trim()) return "Informe o telefone do novo cliente.";
  if (!f.referred_on) return "Informe a data da indicação.";
  if (!f.status) return "Selecione o status: Contratou ou Não contratou.";
  if (f.status === "contratou") {
    if (!f.contracted_plan.trim()) return "Informe o plano contratado.";
    if (!f.new_contract_number.trim()) return "Informe o número do contrato do novo cliente.";
    if (!f.contracted_on) return "Informe a data da contratação.";
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Cancelamentos                                                             */
/* ------------------------------------------------------------------------ */

export type CancellationFilters = DayMonthYear & {
  agentId?: string;
  reason?: string;
  search?: string;
};

export function filterCancellations(list: Cancellation[], f: CancellationFilters): Cancellation[] {
  const q = normalizeText(f.search);
  const reasonKey = f.reason && f.reason !== "all" ? normalizeText(f.reason) : "";
  return list.filter((c) => {
    if (!matchesDayMonthYear(c.cancelled_on, f)) return false;
    if (!matchesAgent(c.agent_id, f.agentId)) return false;
    if (reasonKey && normalizeText(c.reason) !== reasonKey) return false;
    if (!q) return true;
    return clientMatchesSearch(c.client, f.search) || normalizeText(c.current_plan).includes(q);
  });
}

export const cancellationsByReason = (list: Cancellation[]) => {
  const counted = countBy(list, (c) => c.reason);
  // Garante que os motivos padrão apareçam (inclusive com zero) para o comparativo.
  for (const r of CANCELLATION_REASONS) {
    if (!counted.some((c) => normalizeText(c.label) === normalizeText(r)))
      counted.push({ label: r, count: 0 });
  }
  return counted.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
};

export const cancellationsByAgent = (list: Cancellation[], nameOf: (id: string | null) => string) =>
  countBy(list, (c) => nameOf(c.agent_id));

/* ------------------------------------------------------------------------ */
/* Trocas de roteador (visão administrativa)                                 */
/* ------------------------------------------------------------------------ */

export type RouterSwapEntry = { order: ServiceOrder; swap: RouterSwap | null };
export type RouterSwapFilters = {
  from?: string;
  to?: string;
  technicianId?: string;
  reason?: string;
};

/** Data da troca: finalização da OS; senão o registro do motivo; senão a data agendada. */
export const routerSwapDate = (e: RouterSwapEntry) =>
  localDateOf(e.order.completed_at) ?? localDateOf(e.swap?.created_at) ?? e.order.scheduled_date;

export function filterRouterSwaps(
  list: RouterSwapEntry[],
  f: RouterSwapFilters,
): RouterSwapEntry[] {
  return list.filter((e) => {
    const d = routerSwapDate(e);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (f.technicianId && f.technicianId !== "all" && e.order.technician_id !== f.technicianId)
      return false;
    if (f.reason && f.reason !== "all") {
      if (f.reason === NO_SWAP_REASON ? e.swap : e.swap?.reason !== f.reason) return false;
    }
    return true;
  });
}

export const routerSwapsByReason = (list: RouterSwapEntry[]) =>
  countBy(list, (e) => routerSwapReasonLabel(e.swap?.reason));
