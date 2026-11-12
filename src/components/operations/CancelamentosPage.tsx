import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Download,
  Filter,
  Home,
  Info,
  Loader2,
  Pencil,
  Plus,
  Search,
  ThumbsDown,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClientFields,
  EmptyState,
  Field,
  FormSection,
  IndicatorCard,
  PageHeader,
} from "@/components/commercial/CommercialUi";
import { BarList, ChartCard, MonthlyChart } from "@/components/operations/Charts";
import { NO_RESPONSIBLE, clientToInput, emptyClientInput } from "@/lib/commercial-form";
import { commercialApi, type ClientInput } from "@/lib/commercial-api";
import { operationsApi } from "@/lib/operations-api";
import {
  friendlyDbError,
  normalizeText,
  periodLabel,
  type Client,
  type ProfileOption,
} from "@/lib/commercial";
import {
  CANCELLATION_REASONS,
  MONTH_OPTIONS,
  cancellationsByAgent,
  cancellationsByReason,
  conversionRate,
  filterCancellations,
  formatPercent,
  monthlyHistory,
  type Cancellation,
} from "@/lib/operations";
import { downloadCancellationsReportPdf } from "@/lib/pdf-operations";
import { formatDateBR, getLocalDateInputValue } from "@/lib/date";

type CancelForm = {
  client: ClientInput;
  clientId: string | null;
  current_plan: string;
  cancelled_on: string;
  agent_id: string;
  reason: string;
  notes: string;
};

const REASON_ICONS: Record<string, typeof ThumbsDown> = {
  [CANCELLATION_REASONS[0]]: ThumbsDown,
  [CANCELLATION_REASONS[1]]: Home,
};

export function CancelamentosPage() {
  const today = getLocalDateInputValue();
  const [items, setItems] = useState<Cancellation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [month, setMonth] = useState(today.slice(5, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [agent, setAgent] = useState("all");
  const [reason, setReason] = useState("all");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<CancelForm | null>(null);
  const [editing, setEditing] = useState<Cancellation | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, cls] = await Promise.all([
        operationsApi.listCancellations(),
        commercialApi.listClients(),
      ]);
      setItems(list);
      setClients(cls);
      setLoadError(null);
    } catch (err) {
      setLoadError(friendlyDbError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    commercialApi.currentUserId().then(setMe);
    commercialApi
      .listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
    return commercialApi.subscribe("cancelamentos", ["cancellations", "clients"], load);
  }, [load]);

  const agentName = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => {
      m[p.id] = p.full_name;
    });
    return (id: string | null) => (id ? (m[id] ?? "Usuário") : "Sem agente");
  }, [profiles]);

  const filtered = useMemo(
    () => filterCancellations(items, { month, year, agentId: agent, reason }),
    [items, month, year, agent, reason],
  );
  const listed = useMemo(() => filterCancellations(filtered, { search }), [filtered, search]);
  const byReason = cancellationsByReason(filtered);
  const byAgent = cancellationsByAgent(filtered, agentName);
  const historyYear = year || today.slice(0, 4);
  const reasonSeries = useMemo(() => {
    const known = [...CANCELLATION_REASONS] as string[];
    for (const c of items)
      if (!known.some((k) => normalizeText(k) === normalizeText(c.reason))) known.push(c.reason);
    return known.map((label, i) => ({ key: `r${i}`, label }));
  }, [items]);
  const history = useMemo(
    () =>
      monthlyHistory(
        filterCancellations(items, { agentId: agent, reason }),
        (c) => c.cancelled_on,
        historyYear,
        Object.fromEntries(
          reasonSeries.map((s) => [
            s.key,
            (c: Cancellation) => normalizeText(c.reason) === normalizeText(s.label),
          ]),
        ),
      ),
    [items, agent, reason, historyYear, reasonSeries],
  );
  const reasonOptions = useMemo(() => reasonSeries.map((s) => s.label), [reasonSeries]);
  const periodText = [
    periodLabel({ month, year }),
    agent !== "all" ? `Agente: ${agentName(agent === NO_RESPONSIBLE ? null : agent)}` : "",
    reason !== "all" ? `Motivo: ${reason}` : "",
  ]
    .filter(Boolean)
    .join(" - ");

  /* ---------------- formulário ---------------- */
  const openCreate = () => {
    setEditing(null);
    setForm({
      client: emptyClientInput(),
      clientId: null,
      current_plan: "",
      cancelled_on: today,
      agent_id: me ?? "",
      reason: "",
      notes: "",
    });
  };
  const openEdit = (c: Cancellation) => {
    setEditing(c);
    setForm({
      client: clientToInput(c.client),
      clientId: c.client_id,
      current_plan: c.current_plan ?? "",
      cancelled_on: c.cancelled_on,
      agent_id: c.agent_id ?? "",
      reason: c.reason,
      notes: c.notes ?? "",
    });
  };
  const upd = <K extends keyof CancelForm>(k: K, v: CancelForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  /** Ao escolher um cliente da base, sugere o último plano conhecido (upgrade/negociação). */
  const selectClient = async (c: Client | null) => {
    upd("clientId", c?.id ?? null);
    if (!c) return;
    try {
      const plan = await operationsApi.lastKnownPlan(c.id);
      if (plan) setForm((f) => (f && !f.current_plan ? { ...f, current_plan: plan } : f));
    } catch {
      /* sugestão opcional */
    }
  };

  const legacyReason =
    form &&
    form.reason &&
    !CANCELLATION_REASONS.some((r) => normalizeText(r) === normalizeText(form.reason))
      ? form.reason
      : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.client.name.trim()) return toast.error("Informe o nome do cliente.");
    if (!form.cancelled_on) return toast.error("Informe a data do cancelamento.");
    if (!form.reason.trim()) return toast.error("Selecione o motivo do cancelamento.");
    setSaving(true);
    try {
      await operationsApi.saveCancellation(
        form.client,
        {
          current_plan: form.current_plan,
          cancelled_on: form.cancelled_on,
          agent_id: form.agent_id,
          reason: form.reason,
          notes: form.notes,
        },
        editing,
        form.clientId,
      );
      toast.success(editing ? "Cancelamento atualizado." : "Cancelamento registrado.");
      setForm(null);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(friendlyDbError(err));
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await downloadCancellationsReportPdf({
        period: periodText,
        cancellations: filtered,
        agentName,
      });
      toast.success("Relatório de cancelamentos gerado.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o PDF de cancelamentos.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UserMinus}
        title="Cancelamentos"
        subtitle="Registro e acompanhamento interno dos cancelamentos"
        action={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={exportPdf} disabled={exporting || loading}>
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              PDF de cancelamentos
            </Button>
            <Button
              onClick={openCreate}
              className="bg-gradient-primary shadow-elegant hover:opacity-95"
            >
              <Plus className="h-4 w-4 mr-2" /> Registrar cancelamento
            </Button>
          </div>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 text-primary" />
        Controle interno: registrar um cancelamento aqui não cancela o cliente no sistema do
        provedor, não bloqueia a conexão e não altera contratos.
      </div>

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar os cancelamentos.</p>
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
            <Label className="text-xs">Mês</Label>
            <Select value={month || "all"} onValueChange={(v) => setMonth(v === "all" ? "" : v)}>
              <SelectTrigger aria-label="Mês">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {MONTH_OPTIONS.map((m) => (
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
            <Label className="text-xs">Agente</Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger aria-label="Agente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value={NO_RESPONSIBLE}>Sem agente</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Motivo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {reasonOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Período: <strong className="text-foreground">{periodLabel({ month, year })}</strong> (pela
          data do cancelamento).
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IndicatorCard
          index={0}
          icon={UserMinus}
          tone="destructive"
          label={month && year ? "Cancelamentos no mês" : "Cancelamentos no período"}
          value={filtered.length}
        />
        {CANCELLATION_REASONS.map((r, i) => {
          const count =
            byReason.find((b) => normalizeText(b.label) === normalizeText(r))?.count ?? 0;
          return (
            <IndicatorCard
              key={r}
              index={i + 1}
              icon={REASON_ICONS[r] ?? ThumbsDown}
              tone="warning"
              label={r}
              value={count}
              hint={formatPercent(conversionRate(count, filtered.length))}
              active={reason === r}
              onClick={() => setReason(reason === r ? "all" : r)}
            />
          );
        })}
        <IndicatorCard index={3} icon={Users} label="Agentes responsáveis" value={byAgent.length} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <ChartCard
          title={`Histórico mensal (${historyYear})`}
          className="lg:col-span-2"
          testId="cancellations-history"
        >
          <MonthlyChart
            data={history}
            series={reasonSeries.map((s, i) => ({
              ...s,
              color: ["#EF4444", "#F59E0B", "#8B5CF6"][i],
            }))}
          />
        </ChartCard>
        <ChartCard title="Comparativo entre os motivos" testId="cancellations-by-reason">
          <BarList
            items={byReason.map((r) => ({
              ...r,
              extra: formatPercent(conversionRate(r.count, filtered.length)),
            }))}
            empty="Nenhum cancelamento no período."
          />
        </ChartCard>
        <ChartCard
          title="Cancelamentos por agente"
          className="lg:col-span-3"
          testId="cancellations-by-agent"
        >
          <BarList items={byAgent} empty="Nenhum cancelamento no período." />
        </ChartCard>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por cliente, nº do contrato ou plano"
          className="pl-9"
          aria-label="Pesquisar cancelamentos"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : listed.length === 0 ? (
        <EmptyState>
          {items.length
            ? "Nenhum cancelamento encontrado para os filtros selecionados."
            : "Nenhum cancelamento registrado ainda."}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="cancellations-count">
            {listed.length} {listed.length === 1 ? "cancelamento" : "cancelamentos"}
          </p>
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Cliente</th>
                    <th className="text-left px-4 py-3">Nº do contrato</th>
                    <th className="text-left px-4 py-3">Plano</th>
                    <th className="text-left px-4 py-3">Cancelamento</th>
                    <th className="text-left px-4 py-3">Motivo</th>
                    <th className="text-left px-4 py-3">Agente</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {listed.map((c) => (
                    <tr key={c.id} className="hover:bg-accent/20" data-testid="cancellation-row">
                      <td className="px-4 py-3 font-medium">{c.client?.name ?? "—"}</td>
                      <td className="px-4 py-3">{c.client?.client_code || "—"}</td>
                      <td className="px-4 py-3">{c.current_plan || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDateBR(c.cancelled_on)}
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <p>{c.reason}</p>
                        {c.notes && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{c.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{agentName(c.agent_id)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(c)}
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-3 md:hidden">
            {listed.map((c, i) => (
              <motion.article
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                className="rounded-xl border border-border bg-card p-4 shadow-card space-y-2"
                data-testid="cancellation-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{c.client?.name ?? "—"}</h3>
                    <p className="text-xs text-muted-foreground">
                      Contrato {c.client?.client_code || "não informado"} ·{" "}
                      {c.current_plan || "plano não informado"}
                    </p>
                  </div>
                  <span className="text-xs whitespace-nowrap">{formatDateBR(c.cancelled_on)}</span>
                </div>
                <p className="text-sm font-medium">{c.reason}</p>
                {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Agente: {agentName(c.agent_id)}</span>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                </div>
              </motion.article>
            ))}
          </div>
        </>
      )}

      <Dialog
        open={Boolean(form)}
        onOpenChange={(o) => {
          if (!o) {
            setForm(null);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="grid-cols-1 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cancelamento" : "Registrar cancelamento"}</DialogTitle>
            <DialogDescription>Registro interno. Campos com * são obrigatórios.</DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={submit} className="space-y-6" aria-label="Formulário de cancelamento">
              <FormSection title="Cliente">
                <ClientFields
                  value={form.client}
                  onChange={(c) => upd("client", c)}
                  clients={clients}
                  selectedId={form.clientId}
                  onSelect={selectClient}
                  contractOnly
                />
              </FormSection>
              <FormSection title="Cancelamento">
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Plano atual">
                    <Input
                      value={form.current_plan}
                      onChange={(e) => upd("current_plan", e.target.value)}
                      placeholder="Ex.: 300 Mega"
                    />
                  </Field>
                  <Field label="Data do cancelamento *">
                    <Input
                      type="date"
                      required
                      value={form.cancelled_on}
                      onChange={(e) => upd("cancelled_on", e.target.value)}
                    />
                  </Field>
                  <Field label="Agente responsável pelo registro">
                    <Select
                      value={form.agent_id || NO_RESPONSIBLE}
                      onValueChange={(v) => upd("agent_id", v === NO_RESPONSIBLE ? "" : v)}
                    >
                      <SelectTrigger aria-label="Agente responsável pelo registro">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_RESPONSIBLE}>Sem agente</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Motivo do cancelamento *">
                  <Select value={form.reason} onValueChange={(v) => upd("reason", v)}>
                    <SelectTrigger aria-label="Motivo do cancelamento">
                      <SelectValue placeholder="Selecione o motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {CANCELLATION_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                      {legacyReason && (
                        <SelectItem value={legacyReason}>
                          {legacyReason} (motivo anterior)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Observações" hint="Explique melhor a situação do cliente">
                  <Textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => upd("notes", e.target.value)}
                  />
                </Field>
              </FormSection>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setForm(null);
                    setEditing(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="bg-gradient-primary">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : editing ? (
                    "Salvar alterações"
                  ) : (
                    "Registrar cancelamento"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
