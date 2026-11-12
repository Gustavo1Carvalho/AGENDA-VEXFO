/**
 * Relatórios PDF de Indicações, Cancelamentos e Trocas de roteador,
 * no mesmo padrão visual dos demais relatórios (logo VEXFO, cabeçalho repetido, rodapé).
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
  REFERRAL_STATUS_LABELS,
  cancellationsByReason,
  countBy,
  formatPercent,
  conversionRate,
  referralIndicators,
  referralPlans,
  referralsByAgent,
  routerSwapDate,
  routerSwapReasonText,
  routerSwapsByReason,
  type Cancellation,
  type Referral,
  type RouterSwapEntry,
} from "@/lib/operations";
import { SERVICE_STATUS_LABELS } from "@/lib/orders";
import { formatDateBR } from "@/lib/date";

type NameOf = (id: string | null) => string;
const t = (v: unknown) => normalizePdfText(v);
const pctOf = (v: number, total: number) => formatPercent(conversionRate(v, total));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clientParas = (
  name: string | null | undefined,
  contract: string | null | undefined,
): PdfPara[] => [
  { text: t(name) || "Cliente não informado", bold: true },
  contract
    ? { text: `Contrato: ${t(contract)}` }
    : { text: "Contrato: não informado", color: PDF_COLORS.muted },
];

/* ------------------------------------------------------------------------ */
/* Indicações                                                                */
/* ------------------------------------------------------------------------ */

export type ReferralReportInput = {
  period: string;
  referrals: Referral[];
  agentName: NameOf;
  generatedAt?: Date;
};

function referralColumns(agentName: NameOf): PdfColumn<Referral>[] {
  const fixed = 56 + 116 + 110 + 82 + 62;
  return [
    {
      label: "Data da indicação",
      width: 56,
      cell: (r) => [{ text: formatDateBR(r.referred_on), bold: true }],
    },
    {
      label: "Cliente que indicou",
      width: 116,
      cell: (r) => clientParas(r.referrer?.name, r.referrer?.client_code),
    },
    {
      label: "Novo cliente indicado",
      width: 110,
      cell: (r) => [
        { text: t(r.referred_name), bold: true },
        { text: `Tel.: ${t(r.referred_phone)}` },
      ],
    },
    {
      label: "Agente responsável",
      width: 82,
      cell: (r) => [{ text: t(agentName(r.agent_id)) || "—" }],
    },
    {
      label: "Resultado",
      width: 62,
      cell: (r) => [
        {
          text: REFERRAL_STATUS_LABELS[r.status],
          bold: true,
          color: r.status === "contratou" ? PDF_COLORS.green : PDF_COLORS.muted,
        },
      ],
    },
    {
      label: "Contratação",
      width: PDF_CONTENT_WIDTH - fixed,
      cell: (r) =>
        r.status === "contratou"
          ? [
              { text: `Plano: ${t(r.contracted_plan)}`, bold: true },
              { text: `Contrato novo: ${t(r.new_contract_number)}` },
              { text: `Data: ${r.contracted_on ? formatDateBR(r.contracted_on) : "—"}` },
            ]
          : [{ text: "—", color: PDF_COLORS.muted }],
    },
  ];
}

export function buildReferralsReportPdf(input: ReferralReportInput, logo: PdfLogo | null) {
  const list = [...input.referrals].sort(
    (a, b) =>
      a.referred_on.localeCompare(b.referred_on) || a.created_at.localeCompare(b.created_at),
  );
  const ind = referralIndicators(list);
  const byAgent = referralsByAgent(list, input.agentName);
  const plans = referralPlans(list);

  const report = createPdfReport({
    title: "Relatório de Indicações",
    period: input.period,
    logo,
    generatedAt: input.generatedAt,
  });
  report.heading("Resumo das indicações");
  report.statCards([
    { label: "Total de indicações", value: ind.total },
    { label: "Contrataram", value: ind.contratou },
    { label: "Não contrataram", value: ind.naoContratou },
    { label: "Taxa de conversão", value: formatPercent(ind.conversao) },
    { label: "Agentes com indicações", value: byAgent.length },
  ]);
  report.summaryPair(
    {
      title: "Indicações por agente",
      headers: ["Agente", "Qtd.", "Contrataram"],
      rows: byAgent.map((a) => ({
        label: a.label,
        value: a.count,
        extra: `${a.contratou} (${pctOf(a.contratou, a.count)})`,
      })),
      emptyLabel: "Nenhuma indicação",
      valueWidths: [34, 70],
    },
    {
      title: "Planos contratados por indicação",
      headers: ["Plano", "Qtd.", "% contratos"],
      rows: plans.map((p) => ({
        label: p.label,
        value: p.count,
        extra: pctOf(p.count, ind.contratou),
      })),
      emptyLabel: "Nenhuma contratação",
    },
  );
  report.heading("Detalhamento das indicações");
  const ind_ = (n: number) => plural(n, "indicação", "indicações");
  const columns = referralColumns(input.agentName);
  report.tableSection({
    title: "Indicações que contrataram",
    countLabel: ind_(ind.contratou),
    rows: list.filter((r) => r.status === "contratou"),
    columns,
    emptyMessage: "Nenhuma indicação convertida em contratação no período selecionado.",
  });
  report.tableSection({
    title: "Indicações que não contrataram",
    countLabel: ind_(ind.naoContratou),
    rows: list.filter((r) => r.status !== "contratou"),
    columns,
    emptyMessage: "Nenhuma indicação sem contratação no período selecionado.",
  });
  return report.finish();
}

/* ------------------------------------------------------------------------ */
/* Cancelamentos                                                             */
/* ------------------------------------------------------------------------ */

export type CancellationReportInput = {
  period: string;
  cancellations: Cancellation[];
  agentName: NameOf;
  generatedAt?: Date;
};

function cancellationColumns(agentName: NameOf): PdfColumn<Cancellation>[] {
  const fixed = 58 + 150 + 95 + 120;
  return [
    {
      label: "Data do cancelamento",
      width: 58,
      cell: (c) => [{ text: formatDateBR(c.cancelled_on), bold: true }],
    },
    {
      label: "Cliente / Contrato",
      width: 150,
      cell: (c) => clientParas(c.client?.name, c.client?.client_code),
    },
    { label: "Plano", width: 95, cell: (c) => [{ text: t(c.current_plan) || "—" }] },
    {
      label: "Motivo do cancelamento",
      width: 120,
      cell: (c) => [{ text: t(c.reason), bold: true }],
    },
    {
      label: "Agente responsável",
      width: PDF_CONTENT_WIDTH - fixed,
      cell: (c) => [{ text: t(agentName(c.agent_id)) || "—" }],
    },
  ];
}

export function buildCancellationsReportPdf(input: CancellationReportInput, logo: PdfLogo | null) {
  const list = [...input.cancellations].sort(
    (a, b) =>
      a.cancelled_on.localeCompare(b.cancelled_on) || a.created_at.localeCompare(b.created_at),
  );
  const byReason = cancellationsByReason(list);
  const byAgent = countBy(list, (c) => input.agentName(c.agent_id));

  const report = createPdfReport({
    title: "Relatório de Cancelamentos",
    period: input.period,
    logo,
    generatedAt: input.generatedAt,
  });
  report.heading("Resumo dos cancelamentos");
  report.statCards([
    { label: "Cancelamentos no período", value: list.length },
    ...byReason.slice(0, 3).map((r) => ({ label: r.label, value: r.count })),
    { label: "Agentes responsáveis", value: byAgent.length },
  ]);
  report.summaryPair(
    {
      title: "Cancelamentos por motivo",
      headers: ["Motivo", "Qtd.", "% do total"],
      rows: byReason.map((r) => ({
        label: r.label,
        value: r.count,
        extra: pctOf(r.count, list.length),
      })),
    },
    {
      title: "Cancelamentos por agente",
      headers: ["Agente", "Qtd.", "% do total"],
      rows: byAgent.map((a) => ({
        label: a.label,
        value: a.count,
        extra: pctOf(a.count, list.length),
      })),
      emptyLabel: "Nenhum cancelamento",
    },
  );
  report.heading("Detalhamento");
  report.tableSection({
    title: "Cancelamentos registrados",
    countLabel: plural(list.length, "cancelamento", "cancelamentos"),
    rows: list,
    columns: cancellationColumns(input.agentName),
    notes: (c) => c.notes,
    emptyMessage: "Nenhum cancelamento registrado no período selecionado.",
  });
  return report.finish();
}

/* ------------------------------------------------------------------------ */
/* Trocas de roteador                                                        */
/* ------------------------------------------------------------------------ */

export type RouterSwapReportInput = {
  period: string;
  entries: RouterSwapEntry[];
  technicianName: NameOf;
  generatedAt?: Date;
};

function routerSwapColumns(technicianName: NameOf): PdfColumn<RouterSwapEntry>[] {
  const fixed = 58 + 135 + 95 + 135;
  return [
    {
      label: "Data da troca",
      width: 58,
      cell: (e) => [{ text: formatDateBR(routerSwapDate(e)), bold: true }],
    },
    {
      label: "Cliente / Contrato",
      width: 135,
      cell: (e) => clientParas(e.order.client_name, e.swap?.contract_number),
    },
    {
      label: "Técnico responsável",
      width: 95,
      cell: (e) => [{ text: t(technicianName(e.order.technician_id)) || "—" }],
    },
    {
      label: "Motivo da troca",
      width: 135,
      cell: (e) => [
        e.swap
          ? { text: t(routerSwapReasonText(e.swap)), bold: true }
          : { text: "Motivo não registrado", color: PDF_COLORS.muted },
      ],
    },
    {
      label: "Situação da OS",
      width: PDF_CONTENT_WIDTH - fixed,
      cell: (e) => [{ text: SERVICE_STATUS_LABELS[e.order.status] }],
    },
  ];
}

export function buildRouterSwapsReportPdf(input: RouterSwapReportInput, logo: PdfLogo | null) {
  const list = [...input.entries].sort((a, b) =>
    routerSwapDate(a).localeCompare(routerSwapDate(b)),
  );
  const withReason = list.filter((e) => e.swap);
  const byReason = routerSwapsByReason(list);
  const byTech = countBy(list, (e) => input.technicianName(e.order.technician_id));
  const top = routerSwapsByReason(withReason)[0];

  const report = createPdfReport({
    title: "Relatório de Trocas de Roteador",
    period: input.period,
    logo,
    generatedAt: input.generatedAt,
  });
  report.heading("Resumo das trocas");
  report.statCards([
    { label: "Trocas no período", value: list.length },
    { label: "Com motivo registrado", value: withReason.length },
    { label: "Sem motivo registrado", value: list.length - withReason.length },
    { label: "Motivo mais frequente", value: top ? top.label : "—" },
    { label: "Técnicos", value: byTech.length },
  ]);
  report.summaryPair(
    {
      title: "Trocas por motivo",
      headers: ["Motivo", "Qtd.", "% do total"],
      rows: byReason.map((r) => ({
        label: r.label,
        value: r.count,
        extra: pctOf(r.count, list.length),
      })),
      emptyLabel: "Nenhuma troca",
    },
    {
      title: "Trocas por técnico",
      headers: ["Técnico", "Qtd.", "% do total"],
      rows: byTech.map((r) => ({
        label: r.label,
        value: r.count,
        extra: pctOf(r.count, list.length),
      })),
      emptyLabel: "Nenhuma troca",
    },
  );
  report.heading("Detalhamento");
  report.tableSection({
    title: "Trocas de roteador",
    countLabel: plural(list.length, "troca", "trocas"),
    rows: list,
    columns: routerSwapColumns(input.technicianName),
    notes: (e) => e.swap?.notes,
    emptyMessage: "Nenhuma troca de roteador no período selecionado.",
  });
  return report.finish();
}

/* ------------------------------------------------------------------------ */
/* Download no navegador                                                     */
/* ------------------------------------------------------------------------ */

export async function downloadReferralsReportPdf(input: ReferralReportInput) {
  const logo = await loadVexfoLogo();
  downloadPdfBytes(buildReferralsReportPdf(input, logo), pdfFileName(input.period, "indicacoes"));
}

export async function downloadCancellationsReportPdf(input: CancellationReportInput) {
  const logo = await loadVexfoLogo();
  downloadPdfBytes(
    buildCancellationsReportPdf(input, logo),
    pdfFileName(input.period, "cancelamentos"),
  );
}

export async function downloadRouterSwapsReportPdf(input: RouterSwapReportInput) {
  const logo = await loadVexfoLogo();
  downloadPdfBytes(
    buildRouterSwapsReportPdf(input, logo),
    pdfFileName(input.period, "trocas-roteador"),
  );
}
