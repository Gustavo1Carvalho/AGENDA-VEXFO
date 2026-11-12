import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  Loader2,
  Pencil,
  Percent,
  Plus,
  RotateCcw,
  Search,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { friendlyDbError, periodLabel, type Client, type ProfileOption } from "@/lib/commercial";
import {
  MONTH_OPTIONS,
  REFERRAL_STATUS_LABELS,
  REFERRAL_STATUS_STYLES,
  filterReferrals,
  formatPercent,
  monthlyHistory,
  referralIndicators,
  referralPlans,
  referralsByAgent,
  validateReferral,
  type Referral,
  type ReferralFormInput,
  type ReferralStatus,
} from "@/lib/operations";
import { downloadReferralsReportPdf } from "@/lib/pdf-operations";
import { formatDateBR, getLocalDateInputValue } from "@/lib/date";
import { cn } from "@/lib/utils";

type RefForm = ReferralFormInput & {
  referrer: ClientInput;
  referrerId: string | null;
  agent_id: string;
};

export function StatusPill({ status }: { status: ReferralStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        REFERRAL_STATUS_STYLES[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {REFERRAL_STATUS_LABELS[status]}
    </span>
  );
}

export function IndicacoesPage() {
  const today = getLocalDateInputValue();
  const [items, setItems] = useState<Referral[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [month, setMonth] = useState(today.slice(5, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [agent, setAgent] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ReferralStatus | "all">("all");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<RefForm | null>(null);
  const [editing, setEditing] = useState<Referral | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [refs, cls] = await Promise.all([
        operationsApi.listReferrals(),
        commercialApi.listClients(),
      ]);
      setItems(refs);
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
    return commercialApi.subscribe("indicacoes", ["referrals", "clients"], load);
  }, [load]);

  const agentName = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => {
      m[p.id] = p.full_name;
    });
    return (id: string | null) => (id ? (m[id] ?? "Usuário") : "Sem agente");
  }, [profiles]);

  // Painel: período (mês/ano) + agente. Listagem: também status e pesquisa.
  const inPeriod = useMemo(
    () => filterReferrals(items, { month, year, agentId: agent }),
    [items, month, year, agent],
  );
  const listed = useMemo(
    () => filterReferrals(inPeriod, { status: statusFilter, search }),
    [inPeriod, statusFilter, search],
  );
  const ind = referralIndicators(inPeriod);
  const byAgent = referralsByAgent(inPeriod, agentName);
  const plans = referralPlans(inPeriod);
  const historyYear = year || today.slice(0, 4);
  const history = useMemo(
    () =>
      monthlyHistory(
        filterReferrals(items, { agentId: agent }),
        (r) => r.referred_on,
        historyYear,
        { contrataram: (r) => r.status === "contratou" },
      ),
    [items, agent, historyYear],
  );
  const periodText = `${periodLabel({ month, year })}${agent !== "all" ? ` - Agente: ${agentName(agent === NO_RESPONSIBLE ? null : agent)}` : ""}`;
  const hasListFilters = Boolean(statusFilter !== "all" || search);

  /* ---------------- formulário ---------------- */
  const openCreate = () => {
    setEditing(null);
    setForm({
      referrer: emptyClientInput(),
      referrerId: null,
      agent_id: me ?? "",
      referred_name: "",
      referred_phone: "",
      referred_on: today,
      status: "",
      contracted_plan: "",
      new_contract_number: "",
      contracted_on: "",
    });
  };
  const openEdit = (r: Referral) => {
    setEditing(r);
    setForm({
      referrer: clientToInput(r.referrer),
      referrerId: r.referrer_client_id,
      agent_id: r.agent_id ?? "",
      referred_name: r.referred_name,
      referred_phone: r.referred_phone,
      referred_on: r.referred_on,
      status: r.status,
      contracted_plan: r.contracted_plan ?? "",
      new_contract_number: r.new_contract_number ?? "",
      contracted_on: r.contracted_on ?? "",
    });
  };
  const upd = <K extends keyof RefForm>(k: K, v: RefForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const error = validateReferral(form.referrer.name, form);
    if (error) return toast.error(error);
    setSaving(true);
    try {
      await operationsApi.saveReferral(
        form.referrer,
        {
          agent_id: form.agent_id,
          referred_name: form.referred_name,
          referred_phone: form.referred_phone,
          referred_on: form.referred_on,
          status: form.status as ReferralStatus,
          contracted_plan: form.contracted_plan,
          new_contract_number: form.new_contract_number,
          contracted_on: form.contracted_on,
        },
        editing,
        form.referrerId,
      );
      toast.success(editing ? "Indicação atualizada." : "Indicação cadastrada.");
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
      await downloadReferralsReportPdf({ period: periodText, referrals: inPeriod, agentName });
      toast.success("Relatório de indicações gerado.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o PDF de indicações.");
    } finally {
      setExporting(false);
    }
  };

  const contratou = form?.status === "contratou";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UserPlus}
        title="Indicações"
        subtitle="Clientes que indicaram novos clientes para a VEXFO Fibra"
        action={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={exportPdf} disabled={exporting || loading}>
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              PDF de indicações
            </Button>
            <Button
              onClick={openCreate}
              className="bg-gradient-primary shadow-elegant hover:opacity-95"
            >
              <Plus className="h-4 w-4 mr-2" /> Nova indicação
            </Button>
          </div>
        }
      />

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar as indicações.</p>
            <p className="text-muted-foreground">{loadError}</p>
          </div>
        </div>
      )}

      {/* Filtros do painel */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
          <div className="space-y-1.5 col-span-2 sm:col-span-1">
            <Label className="text-xs">Agente responsável</Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger aria-label="Agente responsável">
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
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Período: <strong className="text-foreground">{periodLabel({ month, year })}</strong> (pela
          data da indicação).
        </p>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IndicatorCard
          index={0}
          icon={UserPlus}
          label={month && year ? "Indicações no mês" : "Indicações no período"}
          value={ind.total}
        />
        <IndicatorCard
          index={1}
          icon={CheckCircle2}
          tone="success"
          label="Contrataram"
          value={ind.contratou}
          active={statusFilter === "contratou"}
          onClick={() => setStatusFilter(statusFilter === "contratou" ? "all" : "contratou")}
        />
        <IndicatorCard
          index={2}
          icon={XCircle}
          tone="destructive"
          label="Não contrataram"
          value={ind.naoContratou}
          active={statusFilter === "nao_contratou"}
          onClick={() =>
            setStatusFilter(statusFilter === "nao_contratou" ? "all" : "nao_contratou")
          }
        />
        <IndicatorCard
          index={3}
          icon={Percent}
          tone="warning"
          label="Taxa de conversão"
          value={formatPercent(ind.conversao)}
          hint={`${ind.contratou} de ${ind.total} indicações`}
        />
      </div>

      {/* Painel */}
      <div className="grid lg:grid-cols-3 gap-4">
        <ChartCard
          title={`Histórico mensal (${historyYear})`}
          className="lg:col-span-2"
          testId="referrals-history"
        >
          <MonthlyChart
            data={history}
            series={[
              { key: "total", label: "Indicações" },
              { key: "contrataram", label: "Contrataram", color: "#84CC16" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Indicações por agente" testId="referrals-by-agent">
          <BarList
            items={byAgent.map((a) => ({
              label: a.label,
              count: a.count,
              extra: `${a.contratou} contrataram`,
            }))}
            empty="Nenhuma indicação no período."
          />
        </ChartCard>
        <ChartCard
          title="Planos contratados por indicação"
          className="lg:col-span-3"
          testId="referrals-plans"
        >
          <BarList items={plans} empty="Nenhuma contratação por indicação no período." />
        </ChartCard>
      </div>

      {/* Listagem */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por cliente, contrato, novo cliente ou telefone"
            className="pl-9"
            aria-label="Pesquisar indicações"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ReferralStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="contratou">Contratou</SelectItem>
            <SelectItem value="nao_contratou">Não contratou</SelectItem>
          </SelectContent>
        </Select>
        {hasListFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setStatusFilter("all");
              setSearch("");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : listed.length === 0 ? (
        <EmptyState>
          {items.length
            ? "Nenhuma indicação encontrada para os filtros selecionados."
            : "Nenhuma indicação cadastrada ainda."}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="referrals-count">
            {listed.length} {listed.length === 1 ? "indicação" : "indicações"}
          </p>
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-3">Cliente que indicou</th>
                    <th className="text-left px-3 py-3">Novo cliente</th>
                    <th className="text-left px-3 py-3">Agente</th>
                    <th className="text-left px-3 py-3">Indicação</th>
                    <th className="text-left px-3 py-3">Status</th>
                    <th className="text-left px-3 py-3">Plano contratado</th>
                    <th className="text-left px-3 py-3">Contrato novo</th>
                    <th className="text-left px-3 py-3">Contratação</th>
                    <th className="text-right px-3 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {listed.map((r) => {
                    const c = r.status === "contratou";
                    return (
                      <tr key={r.id} className="hover:bg-accent/20" data-testid="referral-row">
                        <td className="px-3 py-3">
                          <p className="font-medium">{r.referrer?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.referrer?.client_code
                              ? `Contrato ${r.referrer.client_code}`
                              : "Contrato não informado"}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium">{r.referred_name}</p>
                          <p className="text-xs text-muted-foreground">{r.referred_phone}</p>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{agentName(r.agent_id)}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatDateBR(r.referred_on)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill status={r.status} />
                        </td>
                        <td className="px-3 py-3">{c ? r.contracted_plan : "—"}</td>
                        <td className="px-3 py-3">{c ? r.new_contract_number : "—"}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {c && r.contracted_on ? formatDateBR(r.contracted_on) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(r)}
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-3 md:hidden">
            {listed.map((r, i) => (
              <motion.article
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                className="rounded-xl border border-border bg-card p-4 shadow-card space-y-2"
                data-testid="referral-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{r.referred_name}</h3>
                    <p className="text-xs text-muted-foreground">{r.referred_phone}</p>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                <p className="text-sm">
                  Indicado por <strong>{r.referrer?.name ?? "—"}</strong>
                  {r.referrer?.client_code ? ` (contrato ${r.referrer.client_code})` : ""}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Indicação: {formatDateBR(r.referred_on)}</span>
                  <span>Agente: {agentName(r.agent_id)}</span>
                  {r.status === "contratou" && (
                    <span>
                      {r.contracted_plan} · contrato {r.new_contract_number}
                      {r.contracted_on ? ` · ${formatDateBR(r.contracted_on)}` : ""}
                    </span>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                </div>
              </motion.article>
            ))}
          </div>
        </>
      )}

      {/* Formulário */}
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
            <DialogTitle>{editing ? "Editar indicação" : "Nova indicação"}</DialogTitle>
            <DialogDescription>Campos com * são obrigatórios.</DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={submit} className="space-y-6" aria-label="Formulário de indicação">
              <FormSection title="Cliente que indicou">
                <ClientFields
                  value={form.referrer}
                  onChange={(c) => upd("referrer", c)}
                  clients={clients}
                  selectedId={form.referrerId}
                  onSelect={(c) => upd("referrerId", c?.id ?? null)}
                  contractOnly
                  nameLabel="Nome do cliente indicador *"
                  contractLabel="Número do contrato do indicador"
                />
                <Field label="Agente responsável pela indicação">
                  <Select
                    value={form.agent_id || NO_RESPONSIBLE}
                    onValueChange={(v) => upd("agent_id", v === NO_RESPONSIBLE ? "" : v)}
                  >
                    <SelectTrigger aria-label="Agente responsável pela indicação">
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
              </FormSection>

              <FormSection title="Novo cliente indicado">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="Nome do novo cliente *">
                      <Input
                        required
                        value={form.referred_name}
                        onChange={(e) => upd("referred_name", e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label="Telefone do novo cliente *">
                    <Input
                      required
                      inputMode="tel"
                      value={form.referred_phone}
                      onChange={(e) => upd("referred_phone", e.target.value)}
                      placeholder="(98) 99999-9999"
                    />
                  </Field>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Data da indicação *">
                    <Input
                      type="date"
                      required
                      value={form.referred_on}
                      onChange={(e) => upd("referred_on", e.target.value)}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Resultado da indicação">
                <div className="space-y-2">
                  <Label>Status *</Label>
                  <div
                    className="grid grid-cols-2 gap-3"
                    role="radiogroup"
                    aria-label="Status da indicação"
                  >
                    {(["contratou", "nao_contratou"] as ReferralStatus[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={form.status === s}
                        onClick={() => upd("status", s)}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                          form.status === s
                            ? s === "contratou"
                              ? "border-success bg-success/15 text-success"
                              : "border-destructive/60 bg-destructive/10 text-destructive"
                            : "border-input hover:bg-accent",
                        )}
                      >
                        {s === "contratou" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        {REFERRAL_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
                {contratou && (
                  <div
                    className="grid sm:grid-cols-3 gap-4 rounded-lg border border-success/30 bg-success/5 p-4"
                    data-testid="contracted-fields"
                  >
                    <Field label="Plano contratado *">
                      <Input
                        required
                        value={form.contracted_plan}
                        onChange={(e) => upd("contracted_plan", e.target.value)}
                        placeholder="Ex.: 600 Mega"
                      />
                    </Field>
                    <Field label="Número do contrato do novo cliente *">
                      <Input
                        required
                        value={form.new_contract_number}
                        onChange={(e) => upd("new_contract_number", e.target.value)}
                      />
                    </Field>
                    <Field label="Data da contratação *">
                      <Input
                        type="date"
                        required
                        value={form.contracted_on}
                        onChange={(e) => upd("contracted_on", e.target.value)}
                      />
                    </Field>
                  </div>
                )}
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
                    "Cadastrar indicação"
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
