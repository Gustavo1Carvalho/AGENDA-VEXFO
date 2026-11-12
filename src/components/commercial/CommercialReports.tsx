import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Briefcase,
  CheckCircle2,
  Download,
  Filter,
  Handshake,
  Loader2,
  Rocket,
  TrendingUp,
  Trophy,
  Wallet,
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
import { IndicatorCard, PageHeader } from "@/components/commercial/CommercialUi";
import { NO_RESPONSIBLE } from "@/lib/commercial-form";
import { commercialApi } from "@/lib/commercial-api";
import {
  formatMoney,
  friendlyDbError,
  matchesDayMonthYear,
  periodLabel,
  planBreakdown,
  reasonBreakdown,
  upgradeDifference,
  type Negotiation,
  type PlanUpgrade,
  type ProfileOption,
} from "@/lib/commercial";
import { downloadNegotiationsReportPdf, downloadUpgradesReportPdf } from "@/lib/pdf-commercial";
import { getLocalDateInputValue } from "@/lib/date";

function BarList({
  items,
  empty,
  format,
}: {
  items: Array<{ label: string; value: number; extra?: string }>;
  empty: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="text-sm text-muted-foreground py-2">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{it.label}</span>
            <span className="shrink-0 font-semibold">
              {format ? format(it.value) : it.value}
              {it.extra ? (
                <span className="ml-2 font-normal text-muted-foreground">{it.extra}</span>
              ) : null}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-primary"
              style={{ width: `${(it.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CommercialReports() {
  const today = getLocalDateInputValue();
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [upgrades, setUpgrades] = useState<PlanUpgrade[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [month, setMonth] = useState(today.slice(5, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [resp, setResp] = useState("all");
  const [exporting, setExporting] = useState<"neg" | "up" | null>(null);

  const load = useCallback(async () => {
    try {
      const [n, u] = await Promise.all([
        commercialApi.listNegotiations(),
        commercialApi.listUpgrades(),
      ]);
      setNegotiations(n);
      setUpgrades(u);
      setLoadError(null);
    } catch (err) {
      setLoadError(friendlyDbError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    commercialApi
      .listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
    return commercialApi.subscribe(
      "relatorios-comerciais",
      ["negotiations", "plan_upgrades", "clients"],
      load,
    );
  }, [load]);

  const responsibleName = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => {
      m[p.id] = p.full_name;
    });
    return (id: string | null) => (id ? (m[id] ?? "Usuário") : "Sem responsável");
  }, [profiles]);

  const f = { day, month, year };
  const respOk = (id: string | null) =>
    resp === "all" || (resp === NO_RESPONSIBLE ? !id : id === resp);
  const negs = useMemo(
    () =>
      negotiations.filter(
        (n) =>
          matchesDayMonthYear(n.registered_on, { day, month, year }) && respOk(n.responsible_id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [negotiations, day, month, year, resp],
  );
  const ups = useMemo(
    () =>
      upgrades.filter(
        (u) =>
          matchesDayMonthYear(u.upgrade_date, { day, month, year }) && respOk(u.responsible_id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upgrades, day, month, year, resp],
  );

  const blocked = negs.filter((n) => n.status === "bloqueado");
  const converted = negs.filter((n) => n.status === "convertido");
  const inNeg = negs.filter((n) => n.status === "em_negociacao");
  const reasons = reasonBreakdown(blocked);
  const revenue = ups.reduce((s, u) => Math.round((s + upgradeDifference(u)) * 100) / 100, 0);
  const plans = planBreakdown(ups);
  const conversion = negs.length
    ? `${((converted.length / negs.length) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
    : "—";
  const period = `${periodLabel(f)}${resp !== "all" ? ` - Responsável: ${resp === NO_RESPONSIBLE ? "sem responsável" : responsibleName(resp)}` : ""}`;

  const exportNeg = async () => {
    setExporting("neg");
    try {
      await downloadNegotiationsReportPdf({ period, negotiations: negs, responsibleName, today });
      toast.success("Relatório de negociações gerado.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o PDF de negociações.");
    } finally {
      setExporting(null);
    }
  };
  const exportUp = async () => {
    setExporting("up");
    try {
      await downloadUpgradesReportPdf({ period, upgrades: ups, responsibleName });
      toast.success("Relatório de upgrades gerado.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o PDF de upgrades.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Briefcase}
        title="Relatórios comerciais"
        subtitle="Negociações, bloqueios, conversões e upgrades por dia, mês e ano"
      />

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar os dados comerciais.</p>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Dia</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              placeholder="Todos"
              aria-label="Dia"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mês</Label>
            <Select value={month || "all"} onValueChange={(v) => setMonth(v === "all" ? "" : v)}>
              <SelectTrigger aria-label="Mês">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ano</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Todos"
              aria-label="Ano"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Responsável</Label>
            <Select value={resp} onValueChange={setResp}>
              <SelectTrigger aria-label="Responsável">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value={NO_RESPONSIBLE}>Sem responsável</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Período: <strong className="text-foreground">{periodLabel(f)}</strong>. Negociações pela
          data do cadastro; upgrades pela data do upgrade.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid xl:grid-cols-2 gap-6">
          {/* Negociações */}
          <section
            className="rounded-xl border border-border bg-card p-5 shadow-card space-y-5"
            data-testid="report-negotiations"
          >
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Handshake className="h-5 w-5 text-primary" />
                Negociações
              </h2>
              <Button
                onClick={exportNeg}
                disabled={exporting !== null}
                className="bg-gradient-primary shadow-elegant hover:opacity-95"
              >
                {exporting === "neg" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                PDF de negociações
              </Button>
            </header>
            <div className="grid grid-cols-2 gap-3">
              <IndicatorCard icon={Handshake} label="Em negociação" value={inNeg.length} />
              <IndicatorCard
                icon={Ban}
                tone="destructive"
                label="Bloqueados"
                value={blocked.length}
              />
              <IndicatorCard
                icon={CheckCircle2}
                tone="success"
                label="Convertidas em contratação"
                value={converted.length}
                hint={`Conversão: ${conversion}`}
              />
              <IndicatorCard icon={TrendingUp} label="Total no período" value={negs.length} />
            </div>
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Motivos dos bloqueios
              </h3>
              <BarList
                items={reasons.map((r) => ({ label: r.label, value: r.count }))}
                empty="Nenhum cliente bloqueado no período."
              />
            </div>
          </section>

          {/* Upgrades */}
          <section
            className="rounded-xl border border-border bg-card p-5 shadow-card space-y-5"
            data-testid="report-upgrades"
          >
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Rocket className="h-5 w-5 text-primary" />
                Upgrades
              </h2>
              <Button
                onClick={exportUp}
                disabled={exporting !== null}
                className="bg-gradient-primary shadow-elegant hover:opacity-95"
              >
                {exporting === "up" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                PDF de upgrades
              </Button>
            </header>
            <div className="grid grid-cols-2 gap-3">
              <IndicatorCard icon={TrendingUp} label="Upgrades realizados" value={ups.length} />
              <IndicatorCard
                icon={Wallet}
                tone="success"
                label="Aumento de receita mensal"
                value={formatMoney(revenue)}
              />
              <IndicatorCard
                icon={Wallet}
                label="Aumento médio"
                value={formatMoney(ups.length ? revenue / ups.length : 0)}
              />
              <IndicatorCard
                icon={Trophy}
                tone="warning"
                label="Plano mais vendido"
                value={<span className="text-xl">{plans[0]?.label ?? "—"}</span>}
                hint={plans[0] ? `${plans[0].count} upgrade(s)` : undefined}
              />
            </div>
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Upgrades por novo plano
              </h3>
              <BarList
                items={plans.map((p) => ({
                  label: p.label,
                  value: p.count,
                  extra: `+${formatMoney(p.revenue)}/mês`,
                }))}
                empty="Nenhum upgrade no período."
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
