/**
 * Regras de negócio dos módulos comerciais (Negociações e Upgrades).
 * Funções puras — sem acesso a banco ou DOM — para facilitar testes.
 */
import type { Database } from "@/integrations/supabase/types";

export type NegotiationStatus = Database["public"]["Enums"]["negotiation_status"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type NegotiationRow = Database["public"]["Tables"]["negotiations"]["Row"];
export type NegotiationContact = Database["public"]["Tables"]["negotiation_contacts"]["Row"];
export type PlanUpgradeRow = Database["public"]["Tables"]["plan_upgrades"]["Row"];

export type Negotiation = NegotiationRow & { client: Client | null };
export type PlanUpgrade = PlanUpgradeRow & { client: Client | null };
export type ProfileOption = { id: string; full_name: string };

/* ------------------------------------------------------------------------ */
/* Rótulos                                                                   */
/* ------------------------------------------------------------------------ */

export const NEGOTIATION_STATUS_LABELS: Record<NegotiationStatus, string> = {
  em_negociacao: "Em negociação",
  bloqueado: "Bloqueado",
  convertido: "Convertido em contratação",
};

export const NEGOTIATION_STATUS_STYLES: Record<NegotiationStatus, string> = {
  em_negociacao: "bg-primary/15 text-primary border-primary/30",
  bloqueado: "bg-destructive/15 text-destructive border-destructive/30",
  convertido: "bg-success/15 text-success border-success/30",
};

export const NEGOTIATION_REASONS = [
  "Fatura em atraso",
  "Solicitou cancelamento, mas falta pagar a fatura",
  "Aguardando remover o roteador",
] as const;
export const OTHER_REASON = "Outros";

export const CONTACT_TYPE_LABELS: Record<string, string> = {
  telefone: "Ligação",
  whatsapp: "WhatsApp",
  presencial: "Presencial",
  email: "E-mail",
  observacao: "Observação",
  situacao: "Mudança de situação",
};
export const MANUAL_CONTACT_TYPES = [
  "telefone",
  "whatsapp",
  "presencial",
  "email",
  "observacao",
] as const;

/* ------------------------------------------------------------------------ */
/* Texto, documentos e dinheiro                                              */
/* ------------------------------------------------------------------------ */

/** Minúsculas, sem acentos e com espaços normalizados (para busca/comparação). */
export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

/** Valida CPF (11 dígitos + dígitos verificadores). */
export function isValidCpf(value: unknown): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function formatCpf(value: unknown): string {
  const d = onlyDigits(value);
  if (d.length !== 11) return String(value ?? "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Converte texto digitado em valor monetário.
 * Aceita "119,99", "R$ 1.234,56", "1.234", "119.99" e "1234". Retorna null se inválido.
 */
export function parseMoney(input: unknown): number | null {
  let s = String(input ?? "").replace(/R\$|\s/gi, "");
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.234" = mil duzentos e trinta e quatro
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatMoney = (value: number | null | undefined) => BRL.format(Number(value ?? 0));

/** "119,99" para preencher campos de edição. */
export const moneyInputValue = (value: number | null | undefined) =>
  value == null
    ? ""
    : Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Diferença de mensalidade em centavos exatos (evita erros de ponto flutuante). */
export function monthlyDifference(previousValue: number, newValue: number): number {
  return (Math.round(newValue * 100) - Math.round(previousValue * 100)) / 100;
}

/** Diferença com sinal: "+ R$ 20,00" / "− R$ 5,00" / "R$ 0,00". */
export function formatDifference(value: number | null | undefined): string {
  const v = Number(value ?? 0);
  if (v > 0) return `+ ${formatMoney(v)}`;
  if (v < 0) return `− ${formatMoney(Math.abs(v))}`;
  return formatMoney(0);
}

/** Diferença de um registro (usa a coluna calculada pelo banco quando disponível). */
export const upgradeDifference = (
  u: Pick<PlanUpgradeRow, "monthly_difference" | "previous_value" | "new_value">,
) =>
  u.monthly_difference != null
    ? Number(u.monthly_difference)
    : monthlyDifference(Number(u.previous_value), Number(u.new_value));

/* ------------------------------------------------------------------------ */
/* Datas                                                                     */
/* ------------------------------------------------------------------------ */

/** Data ISO (aaaa-mm-dd) dentro do intervalo [from, to] (limites opcionais). */
export function inDateRange(date: string | null | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!date) return false;
  const d = date.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export type DayMonthYear = { day?: string; month?: string; year?: string };

/** Mesmo critério de período dos relatórios de OS (dia/mês/ano opcionais). */
export function matchesDayMonthYear(date: string | null | undefined, f: DayMonthYear): boolean {
  if (!date) return !f.day && !f.month && !f.year;
  const [y, m, d] = date.slice(0, 10).split("-");
  if (f.year && y !== f.year) return false;
  if (f.month && m !== f.month) return false;
  if (f.day && d !== f.day.padStart(2, "0")) return false;
  return true;
}

export function periodLabel(f: DayMonthYear): string {
  if (f.day && f.month && f.year) return `Dia ${f.day.padStart(2, "0")}/${f.month}/${f.year}`;
  if (f.month && f.year) return `Mês ${f.month}/${f.year}`;
  if (f.year) return `Ano ${f.year}`;
  if (f.month) return `Mês ${f.month} (todos os anos)`;
  return "Todo o período";
}

/* ------------------------------------------------------------------------ */
/* Negociações                                                               */
/* ------------------------------------------------------------------------ */

export type ContactState = "atrasado" | "hoje" | "agendado" | "sem_data" | "encerrado";

/** Situação do próximo contato em relação a hoje (aaaa-mm-dd). */
export function contactState(
  n: Pick<NegotiationRow, "status" | "next_contact_on">,
  today: string,
): ContactState {
  if (n.status === "convertido") return "encerrado";
  if (!n.next_contact_on) return "sem_data";
  if (n.next_contact_on < today) return "atrasado";
  if (n.next_contact_on === today) return "hoje";
  return "agendado";
}

export const isAwaitingReturn = (n: Pick<NegotiationRow, "status" | "reason">) =>
  n.status !== "convertido" && normalizeText(n.reason).includes("aguardando retorno");

export function negotiationIndicators(list: Negotiation[], today: string) {
  let emNegociacao = 0,
    bloqueados = 0,
    convertidos = 0,
    aguardandoRetorno = 0,
    contatosPendentes = 0,
    atrasados = 0;
  for (const n of list) {
    if (n.status === "em_negociacao") emNegociacao++;
    else if (n.status === "bloqueado") bloqueados++;
    else convertidos++;
    if (isAwaitingReturn(n)) aguardandoRetorno++;
    const st = contactState(n, today);
    if (st === "atrasado" || st === "hoje") contatosPendentes++;
    if (st === "atrasado") atrasados++;
  }
  return { emNegociacao, bloqueados, convertidos, aguardandoRetorno, contatosPendentes, atrasados };
}

export type NegotiationFilters = {
  search?: string;
  status?: NegotiationStatus | "all";
  responsibleId?: string | "all";
  from?: string;
  to?: string;
  onlyPending?: boolean;
  onlyAwaitingReturn?: boolean;
  today: string;
};

/** Pesquisa por nome, telefone, número do contrato ou CPF do cliente. */
export function clientMatchesSearch(client: Client | null, search: string | undefined): boolean {
  const q = normalizeText(search);
  if (!q) return true;
  if (!client) return false;
  if ([client.name, client.client_code].some((f) => normalizeText(f).includes(q))) return true;
  const digits = onlyDigits(q);
  return (
    digits.length >= 3 && [client.phone, client.cpf].some((f) => onlyDigits(f).includes(digits))
  );
}

export function filterNegotiations(list: Negotiation[], f: NegotiationFilters): Negotiation[] {
  return list.filter((n) => {
    if (f.status && f.status !== "all" && n.status !== f.status) return false;
    if (f.responsibleId && f.responsibleId !== "all") {
      if (f.responsibleId === "none" ? n.responsible_id : n.responsible_id !== f.responsibleId)
        return false;
    }
    if (!inDateRange(n.registered_on, f.from, f.to)) return false;
    if (f.onlyAwaitingReturn && !isAwaitingReturn(n)) return false;
    if (f.onlyPending) {
      const st = contactState(n, f.today);
      if (st !== "atrasado" && st !== "hoje") return false;
    }
    return clientMatchesSearch(n.client, f.search);
  });
}

/** Ordenação padrão: atrasados primeiro, depois próximo contato mais cedo, depois cadastro mais recente. */
export function sortNegotiations(list: Negotiation[], today: string): Negotiation[] {
  const rank: Record<ContactState, number> = {
    atrasado: 0,
    hoje: 1,
    agendado: 2,
    sem_data: 3,
    encerrado: 4,
  };
  return [...list].sort((a, b) => {
    const ra = rank[contactState(a, today)];
    const rb = rank[contactState(b, today)];
    if (ra !== rb) return ra - rb;
    if (a.next_contact_on && b.next_contact_on && a.next_contact_on !== b.next_contact_on)
      return a.next_contact_on < b.next_contact_on ? -1 : 1;
    return (
      b.registered_on.localeCompare(a.registered_on) || b.created_at.localeCompare(a.created_at)
    );
  });
}

/** Contagem por motivo (agrupa variações de maiúsculas/acentos; mantém a grafia mais frequente). */
export function reasonBreakdown(list: Pick<NegotiationRow, "reason">[]) {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const n of list) {
    const label = n.reason.trim().replace(/\s+/g, " ");
    const key = normalizeText(label);
    const g = groups.get(key) ?? { count: 0, spellings: new Map() };
    g.count++;
    g.spellings.set(label, (g.spellings.get(label) ?? 0) + 1);
    groups.set(key, g);
  }
  const suggested = new Map<string, string>(
    [...NEGOTIATION_REASONS, OTHER_REASON].map((r) => [normalizeText(r), r]),
  );
  return [...groups.entries()]
    .map(([key, g]) => ({
      // Grafia oficial quando for um motivo sugerido; senão a mais usada (empate: a primeira registrada).
      label: suggested.get(key) ?? [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: g.count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

/* ------------------------------------------------------------------------ */
/* Upgrades                                                                  */
/* ------------------------------------------------------------------------ */

export type UpgradeFilters = {
  search?: string;
  plan?: string | "all";
  responsibleId?: string | "all";
  from?: string;
  to?: string;
};

export function filterUpgrades(list: PlanUpgrade[], f: UpgradeFilters): PlanUpgrade[] {
  const planKey = f.plan && f.plan !== "all" ? normalizeText(f.plan) : "";
  return list.filter((u) => {
    if (
      planKey &&
      normalizeText(u.new_plan) !== planKey &&
      normalizeText(u.previous_plan) !== planKey
    )
      return false;
    if (f.responsibleId && f.responsibleId !== "all") {
      if (f.responsibleId === "none" ? u.responsible_id : u.responsible_id !== f.responsibleId)
        return false;
    }
    if (!inDateRange(u.upgrade_date, f.from, f.to)) return false;
    return clientMatchesSearch(u.client, f.search);
  });
}

/** Agrupa por plano (novo plano), com quantidade e aumento mensal somado. */
export function planBreakdown(list: PlanUpgrade[]) {
  const groups = new Map<string, { label: string; count: number; revenue: number }>();
  for (const u of list) {
    const key = normalizeText(u.new_plan);
    const g = groups.get(key) ?? { label: u.new_plan.trim(), count: 0, revenue: 0 };
    g.count++;
    g.revenue = Math.round((g.revenue + upgradeDifference(u)) * 100) / 100;
    groups.set(key, g);
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || b.revenue - a.revenue || a.label.localeCompare(b.label, "pt-BR"),
  );
}

export function upgradeIndicators(list: PlanUpgrade[], today: string) {
  const month = today.slice(0, 7);
  const revenue = list.reduce((sum, u) => Math.round((sum + upgradeDifference(u)) * 100) / 100, 0);
  const top = planBreakdown(list)[0] ?? null;
  return {
    total: list.length,
    noMes: list.filter((u) => u.upgrade_date.slice(0, 7) === month).length,
    receitaMensal: revenue,
    planoMaisVendido: top ? { label: top.label, count: top.count } : null,
  };
}

/** Lista de planos já usados (para sugestões e filtro), sem duplicar grafias. */
export function knownPlans(values: Array<string | null | undefined>): string[] {
  const map = new Map<string, string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t && !map.has(normalizeText(t))) map.set(normalizeText(t), t);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

/** Mensagem amigável para erros do banco. */
export function friendlyDbError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  const msg = e?.message ?? String(error ?? "Erro desconhecido");
  if (e?.code === "23505" || /duplicate key/i.test(msg)) {
    if (/cpf/i.test(msg)) return "Já existe um cliente cadastrado com este CPF.";
    if (/client_code/i.test(msg))
      return "Já existe um cliente cadastrado com este número de contrato.";
    return "Registro duplicado.";
  }
  if (e?.code === "23503" || /foreign key/i.test(msg))
    return "Este registro está vinculado a outros dados e não pode ser removido.";
  if (e?.code === "42501" || /row-level security|permission denied/i.test(msg))
    return "Você não tem permissão para esta ação.";
  if (e?.code === "PGRST205" || /could not find the table|schema cache/i.test(msg))
    return "As tabelas dos módulos comerciais ainda não foram criadas no banco. Aplique a migration 20261111120000.";
  return msg;
}
