/**
 * Relatórios PDF dos módulos comerciais (Negociações e Upgrades), no mesmo
 * padrão visual do relatório de OS (logo VEXFO, cabeçalho repetido, rodapé).
 */
import {
  PDF_COLORS,
  PDF_CONTENT_WIDTH,
  createPdfReport,
  downloadPdfBytes,
  loadVexfoLogo,
  normalizePdfText,
  pdfFileName,
  type PdfColumn,
  type PdfLogo,
  type PdfPara,
} from "@/lib/pdf";
import {
  NEGOTIATION_STATUS_LABELS,
  contactState,
  formatCpf,
  formatDifference,
  formatMoney,
  planBreakdown,
  reasonBreakdown,
  upgradeDifference,
  type Negotiation,
  type NegotiationStatus,
  type PlanUpgrade,
} from "@/lib/commercial";
import { formatDateBR } from "@/lib/date";

type NameOf = (id: string | null) => string;

const pctOf = (v: number, total: number) =>
  total ? `${((v / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const t = (v: unknown) => normalizePdfText(v);

/* ------------------------------------------------------------------------ */
/* Negociações                                                               */
/* ------------------------------------------------------------------------ */

export type NegotiationReportInput = {
  period: string;
  negotiations: Negotiation[];
  responsibleName: NameOf;
  today: string;
  generatedAt?: Date;
};

function negotiationColumns(
  responsibleName: NameOf,
  today: string,
  converted = false,
): PdfColumn<Negotiation>[] {
  const fixed = 88 + 112 + 96 + 78 + 88;
  return [
    {
      label: "Datas",
      width: 88,
      cell: (n) => {
        const out: PdfPara[] = [
          {
            text: `Contrato: ${n.contract_started_on ? formatDateBR(n.contract_started_on) : "—"}`,
            bold: true,
          },
          {
            text: `Negociação: ${n.negotiation_started_on ? formatDateBR(n.negotiation_started_on) : "—"}`,
          },
        ];
        if (converted && n.converted_at) {
          out.push({
            text: `Conv.: ${formatDateBR(n.converted_at.slice(0, 10))}`,
            color: PDF_COLORS.green,
          });
        } else if (n.next_contact_on) {
          const late = contactState(n, today) === "atrasado";
          out.push({
            text: `Próx. contato: ${formatDateBR(n.next_contact_on)}`,
            color: late ? PDF_COLORS.red : PDF_COLORS.text,
            bold: late,
          });
          if (late) out.push({ text: "(atrasado)", color: PDF_COLORS.red });
        } else {
          out.push({ text: "Próx. contato: —", color: PDF_COLORS.muted });
        }
        return out;
      },
    },
    {
      label: "Cliente / Contato",
      width: 112,
      cell: (n) => {
        const c = n.client;
        const out: PdfPara[] = [{ text: t(c?.name) || "Cliente não informado", bold: true }];
        if (c?.client_code) out.push({ text: `Contrato: ${t(c.client_code)}` });
        out.push(
          c?.phone
            ? { text: `Tel.: ${t(c.phone)}` }
            : { text: "Tel.: não informado", color: PDF_COLORS.muted },
        );
        if (c?.cpf) out.push({ text: `CPF: ${formatCpf(c.cpf)}`, color: PDF_COLORS.muted });
        return out;
      },
    },
    {
      label: "Endereço / Bairro",
      width: 96,
      cell: (n) => [
        n.client?.address
          ? { text: t(n.client.address) }
          : { text: "Endereço não informado", color: PDF_COLORS.muted },
        { text: `Bairro: ${t(n.client?.neighborhood) || "não informado"}` },
      ],
    },
    {
      label: "Planos",
      width: 78,
      cell: (n) => [
        { text: `Atual: ${t(n.current_plan) || "—"}` },
        { text: `Interesse: ${t(n.interested_plan) || "—"}`, bold: Boolean(n.interested_plan) },
      ],
    },
    { label: "Motivo", width: 88, cell: (n) => [{ text: t(n.reason) }] },
    {
      label: "Responsável",
      width: PDF_CONTENT_WIDTH - fixed,
      cell: (n) => [{ text: t(responsibleName(n.responsible_id)) || "—" }],
    },
  ];
}

export function buildNegotiationsReportPdf(input: NegotiationReportInput, logo: PdfLogo | null) {
  const { negotiations, responsibleName, today } = input;
  const byDate = (a: Negotiation, b: Negotiation) =>
    a.registered_on.localeCompare(b.registered_on) || a.created_at.localeCompare(b.created_at);
  const of = (s: NegotiationStatus) => negotiations.filter((n) => n.status === s).sort(byDate);
  const emNegociacao = of("em_negociacao");
  const bloqueados = of("bloqueado");
  const convertidos = of("convertido");
  const total = negotiations.length;
  const atrasados = negotiations.filter((n) => contactState(n, today) === "atrasado").length;

  const report = createPdfReport({
    title: "Relatório de Negociações",
    period: input.period,
    logo,
    generatedAt: input.generatedAt,
  });
  report.heading("Resumo comercial");
  report.statCards([
    { label: "Clientes no período", value: total },
    { label: "Em negociação", value: emNegociacao.length },
    { label: "Bloqueados", value: bloqueados.length },
    { label: "Convertidos em contratação", value: convertidos.length },
    { label: "Contatos atrasados", value: atrasados },
  ]);

  const reasons = reasonBreakdown(bloqueados);
  report.summaryPair(
    {
      title: "Motivos dos bloqueios",
      headers: ["Motivo", "Qtd.", "% bloqueios"],
      rows: reasons.map((r) => ({
        label: r.label,
        value: r.count,
        extra: pctOf(r.count, bloqueados.length),
      })),
      emptyLabel: "Nenhum cliente bloqueado",
    },
    {
      title: "Situação dos clientes",
      headers: ["Situação", "Qtd.", "% do total"],
      rows: (["em_negociacao", "bloqueado", "convertido"] as NegotiationStatus[]).map((s) => {
        const v = negotiations.filter((n) => n.status === s).length;
        return { label: NEGOTIATION_STATUS_LABELS[s], value: v, extra: pctOf(v, total) };
      }),
    },
  );

  report.heading("Detalhamento dos clientes");
  const clientes = (n: number) => plural(n, "cliente", "clientes");
  report.tableSection({
    title: "Clientes em negociação",
    countLabel: clientes(emNegociacao.length),
    rows: emNegociacao,
    columns: negotiationColumns(responsibleName, today),
    notes: (n) => n.notes,
    emptyMessage: "Nenhum cliente em negociação no período selecionado.",
  });
  report.tableSection({
    title: "Clientes bloqueados",
    countLabel: clientes(bloqueados.length),
    rows: bloqueados,
    columns: negotiationColumns(responsibleName, today),
    notes: (n) => n.notes,
    emptyMessage: "Nenhum cliente bloqueado no período selecionado.",
  });
  report.tableSection({
    title: "Negociações convertidas em contratação",
    countLabel: `${clientes(convertidos.length)} · conversão ${pctOf(convertidos.length, total)}`,
    rows: convertidos,
    columns: negotiationColumns(responsibleName, today, true),
    notes: (n) => n.notes,
    emptyMessage: "Nenhuma negociação convertida em contratação no período selecionado.",
  });
  return report.finish();
}

/* ------------------------------------------------------------------------ */
/* Upgrades                                                                  */
/* ------------------------------------------------------------------------ */

export type UpgradeReportInput = {
  period: string;
  upgrades: PlanUpgrade[];
  responsibleName: NameOf;
  generatedAt?: Date;
};

function upgradeColumns(responsibleName: NameOf): PdfColumn<PlanUpgrade>[] {
  const fixed = 56 + 118 + 112 + 82 + 70;
  return [
    { label: "Data", width: 56, cell: (u) => [{ text: formatDateBR(u.upgrade_date), bold: true }] },
    {
      label: "Cliente / Contato",
      width: 118,
      cell: (u) => {
        const c = u.client;
        const out: PdfPara[] = [{ text: t(c?.name) || "Cliente não informado", bold: true }];
        if (c?.client_code) out.push({ text: `Contrato: ${t(c.client_code)}` });
        if (c?.phone) out.push({ text: `Tel.: ${t(c.phone)}` });
        if (c?.cpf) out.push({ text: `CPF: ${formatCpf(c.cpf)}`, color: PDF_COLORS.muted });
        return out;
      },
    },
    {
      label: "Plano anterior / novo plano",
      width: 112,
      cell: (u) => [
        { text: `De: ${t(u.previous_plan)}`, color: PDF_COLORS.muted },
        { text: `Para: ${t(u.new_plan)}`, bold: true },
      ],
    },
    {
      label: "Mensalidade",
      width: 82,
      cell: (u) => [
        { text: `Anterior: ${formatMoney(u.previous_value)}` },
        { text: `Nova: ${formatMoney(u.new_value)}` },
      ],
    },
    {
      label: "Diferença mensal",
      width: 70,
      cell: (u) => {
        const d = upgradeDifference(u);
        return [
          {
            text: formatDifference(d),
            bold: true,
            color: d > 0 ? PDF_COLORS.green : d < 0 ? PDF_COLORS.red : PDF_COLORS.muted,
          },
        ];
      },
    },
    {
      label: "Responsável",
      width: PDF_CONTENT_WIDTH - fixed,
      cell: (u) => [{ text: t(responsibleName(u.responsible_id)) || "—" }],
    },
  ];
}

export function buildUpgradesReportPdf(input: UpgradeReportInput, logo: PdfLogo | null) {
  const upgrades = [...input.upgrades].sort(
    (a, b) =>
      a.upgrade_date.localeCompare(b.upgrade_date) || a.created_at.localeCompare(b.created_at),
  );
  const revenue = upgrades.reduce((s, u) => Math.round((s + upgradeDifference(u)) * 100) / 100, 0);
  const plans = planBreakdown(upgrades);
  const avg = upgrades.length ? Math.round((revenue / upgrades.length) * 100) / 100 : 0;

  const byResp = new Map<string, { label: string; count: number; revenue: number }>();
  for (const u of upgrades) {
    const key = u.responsible_id ?? "none";
    const g = byResp.get(key) ?? {
      label: input.responsibleName(u.responsible_id),
      count: 0,
      revenue: 0,
    };
    g.count++;
    g.revenue = Math.round((g.revenue + upgradeDifference(u)) * 100) / 100;
    byResp.set(key, g);
  }
  const resp = [...byResp.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);

  const report = createPdfReport({
    title: "Relatório de Upgrades",
    period: input.period,
    logo,
    generatedAt: input.generatedAt,
  });
  report.heading("Resumo de upgrades");
  report.statCards([
    { label: "Upgrades no período", value: upgrades.length },
    { label: "Aumento mensal de receita", value: formatMoney(revenue) },
    { label: "Aumento médio por upgrade", value: formatMoney(avg) },
    { label: "Projeção anual (x12)", value: formatMoney(revenue * 12) },
    {
      label: "Plano mais vendido",
      value: plans[0] ? `${plans[0].label} (${plans[0].count})` : "—",
    },
  ]);
  report.summaryPair(
    {
      title: "Upgrades por novo plano",
      headers: ["Plano", "Qtd.", "Aumento/mês"],
      rows: plans.map((p) => ({ label: p.label, value: p.count, extra: formatMoney(p.revenue) })),
      emptyLabel: "Nenhum upgrade",
      valueWidths: [34, 70],
    },
    {
      title: "Upgrades por responsável",
      headers: ["Responsável", "Qtd.", "Aumento/mês"],
      rows: resp.map((r) => ({ label: r.label, value: r.count, extra: formatMoney(r.revenue) })),
      emptyLabel: "Nenhum upgrade",
      valueWidths: [34, 70],
    },
  );
  report.heading("Upgrades realizados");
  report.tableSection({
    title: "Detalhamento dos upgrades",
    countLabel: `${plural(upgrades.length, "upgrade", "upgrades")} · ${formatDifference(revenue)}/mês`,
    rows: upgrades,
    columns: upgradeColumns(input.responsibleName),
    notes: (u) => u.notes,
    emptyMessage: "Nenhum upgrade registrado no período selecionado.",
  });
  return report.finish();
}

/* ------------------------------------------------------------------------ */
/* Download no navegador                                                     */
/* ------------------------------------------------------------------------ */

export async function downloadNegotiationsReportPdf(input: NegotiationReportInput) {
  const logo = await loadVexfoLogo();
  downloadPdfBytes(
    buildNegotiationsReportPdf(input, logo),
    pdfFileName(input.period, "negociacoes"),
  );
}

export async function downloadUpgradesReportPdf(input: UpgradeReportInput) {
  const logo = await loadVexfoLogo();
  downloadPdfBytes(buildUpgradesReportPdf(input, logo), pdfFileName(input.period, "upgrades"));
}
