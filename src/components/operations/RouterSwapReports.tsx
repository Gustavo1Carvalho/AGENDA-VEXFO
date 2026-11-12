import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Router,
  Trophy,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, IndicatorCard, PageHeader } from "@/components/commercial/CommercialUi";
import { BarList, ChartCard } from "@/components/operations/Charts";
import { StatusBadge } from "@/components/StatusBadge";
import { commercialApi } from "@/lib/commercial-api";
import { operationsApi } from "@/lib/operations-api";
import { friendlyDbError } from "@/lib/commercial";
import {
  NO_SWAP_REASON,
  ROUTER_SWAP_REASONS,
  ROUTER_SWAP_REASON_LABELS,
  countBy,
  filterRouterSwaps,
  routerSwapDate,
  routerSwapReasonText,
  routerSwapsByReason,
  type RouterSwapEntry,
} from "@/lib/operations";
import { downloadRouterSwapsReportPdf } from "@/lib/pdf-operations";
import { formatDateBR, getLocalDateInputValue } from "@/lib/date";

/** Relatório administrativo das trocas de roteador (filtros por período, técnico e motivo). */
export function RouterSwapReports() {
  const today = getLocalDateInputValue();
  const [entries, setEntries] = useState<RouterSwapEntry[]>([]);
  const [technicians, setTechnicians] = useState<Array<{ id: string; full_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [tech, setTech] = useState("all");
  const [reason, setReason] = useState("all");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [orders, swaps] = await Promise.all([
        operationsApi.listRouterSwapOrders(),
        operationsApi.listRouterSwaps(),
      ]);
      const byOrder = new Map(swaps.map((s) => [s.service_order_id, s]));
      setEntries(orders.map((order) => ({ order, swap: byOrder.get(order.id) ?? null })));
      setLoadError(null);
    } catch (err) {
      setLoadError(friendlyDbError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    operationsApi
      .listTechnicians()
      .then(setTechnicians)
      .catch(() => setTechnicians([]));
    return commercialApi.subscribe("trocas-roteador", ["router_swaps", "service_orders"], load);
  }, [load]);

  const techName = useMemo(() => {
    const m: Record<string, string> = {};
    technicians.forEach((t) => {
      m[t.id] = t.full_name;
    });
    return (id: string | null) => (id ? (m[id] ?? "Técnico") : "Sem técnico");
  }, [technicians]);

  const filtered = useMemo(
    () =>
      filterRouterSwaps(entries, { from, to, technicianId: tech, reason }).sort((a, b) =>
        routerSwapDate(b).localeCompare(routerSwapDate(a)),
      ),
    [entries, from, to, tech, reason],
  );
  const withReason = filtered.filter((e) => e.swap);
  const byReason = routerSwapsByReason(filtered);
  const byTech = countBy(filtered, (e) => techName(e.order.technician_id));
  const top = routerSwapsByReason(withReason)[0];
  const period = [
    from || to
      ? `${from ? formatDateBR(from) : "início"} a ${to ? formatDateBR(to) : "hoje"}`
      : "Todo o período",
    tech !== "all" ? `Técnico: ${techName(tech)}` : "",
    reason !== "all"
      ? `Motivo: ${reason === NO_SWAP_REASON ? "sem motivo registrado" : ROUTER_SWAP_REASON_LABELS[reason as keyof typeof ROUTER_SWAP_REASON_LABELS]}`
      : "",
  ]
    .filter(Boolean)
    .join(" - ");

  const exportPdf = async () => {
    setExporting(true);
    try {
      await downloadRouterSwapsReportPdf({ period, entries: filtered, technicianName: techName });
      toast.success("Relatório de trocas de roteador gerado.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o PDF de trocas de roteador.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Router}
        title="Trocas de roteador"
        subtitle="Motivos informados pelos técnicos nas ordens de serviço de troca"
        action={
          <Button
            onClick={exportPdf}
            disabled={exporting || loading}
            className="bg-gradient-primary shadow-elegant hover:opacity-95"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            PDF de trocas
          </Button>
        }
      />

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar as trocas de roteador.</p>
            <p className="text-muted-foreground">{loadError}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros
          </h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Trocas de"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Trocas até"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Técnico</Label>
            <Select value={tech} onValueChange={setTech}>
              <SelectTrigger aria-label="Técnico">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo da troca</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Motivo da troca">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ROUTER_SWAP_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROUTER_SWAP_REASON_LABELS[r]}
                  </SelectItem>
                ))}
                <SelectItem value={NO_SWAP_REASON}>Sem motivo registrado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Data da troca = finalização da OS (ou data agendada, se ainda não finalizada).
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IndicatorCard index={0} icon={Router} label="Trocas no período" value={filtered.length} />
        <IndicatorCard
          index={1}
          icon={CheckCircle2}
          tone="success"
          label="Com motivo registrado"
          value={withReason.length}
        />
        <IndicatorCard
          index={2}
          icon={XCircle}
          tone="warning"
          label="Sem motivo registrado"
          value={filtered.length - withReason.length}
          hint="OS anteriores ou em andamento"
        />
        <IndicatorCard
          index={3}
          icon={Trophy}
          tone="destructive"
          label="Motivo mais frequente"
          value={<span className="text-lg">{top?.label ?? "—"}</span>}
          hint={top ? `${top.count} troca(s)` : undefined}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Trocas por motivo" testId="swaps-by-reason">
          <BarList items={byReason} empty="Nenhuma troca no período." />
        </ChartCard>
        <ChartCard title="Trocas por técnico" testId="swaps-by-tech">
          <BarList items={byTech} empty="Nenhuma troca no período." />
        </ChartCard>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState>Nenhuma troca de roteador encontrada para os filtros selecionados.</EmptyState>
      ) : (
        <>
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Data da troca</th>
                    <th className="text-left px-4 py-3">Cliente</th>
                    <th className="text-left px-4 py-3">Nº do contrato</th>
                    <th className="text-left px-4 py-3">Técnico</th>
                    <th className="text-left px-4 py-3">Motivo</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">OS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((e) => (
                    <tr key={e.order.id} className="hover:bg-accent/20" data-testid="swap-row">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDateBR(routerSwapDate(e))}
                      </td>
                      <td className="px-4 py-3 font-medium">{e.order.client_name}</td>
                      <td className="px-4 py-3">{e.swap?.contract_number || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {techName(e.order.technician_id)}
                      </td>
                      <td className="px-4 py-3 max-w-[280px]">
                        <p className={e.swap ? "" : "text-warning"}>
                          {routerSwapReasonText(e.swap)}
                        </p>
                        {e.swap?.notes && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {e.swap.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={e.order.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" asChild title="Abrir ordem de serviço">
                          <a href={`/ordens/${e.order.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-3 md:hidden">
            {filtered.map((e) => (
              <motion.article
                key={e.order.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-4 shadow-card space-y-1.5"
                data-testid="swap-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold truncate">{e.order.client_name}</h3>
                  <StatusBadge status={e.order.status} />
                </div>
                <p className={e.swap ? "text-sm font-medium" : "text-sm text-warning"}>
                  {routerSwapReasonText(e.swap)}
                </p>
                {e.swap?.notes && <p className="text-xs text-muted-foreground">{e.swap.notes}</p>}
                <p className="text-xs text-muted-foreground">
                  {formatDateBR(routerSwapDate(e))} · {techName(e.order.technician_id)}
                  {e.swap?.contract_number ? ` · contrato ${e.swap.contract_number}` : ""}
                </p>
              </motion.article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
