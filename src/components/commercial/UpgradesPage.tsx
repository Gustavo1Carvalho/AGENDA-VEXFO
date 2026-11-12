import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Filter,
  History,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Rocket,
  Search,
  Trash2,
  TrendingUp,
  Trophy,
  Wallet,
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
  ConfirmDialog,
  EmptyState,
  Field,
  FormSection,
  IndicatorCard,
  PageHeader,
} from "@/components/commercial/CommercialUi";
import { NO_RESPONSIBLE, clientToInput, cpfError, emptyClientInput } from "@/lib/commercial-form";
import { commercialApi, type ClientInput } from "@/lib/commercial-api";
import {
  filterUpgrades,
  formatCpf,
  formatDifference,
  formatMoney,
  friendlyDbError,
  knownPlans,
  moneyInputValue,
  monthlyDifference,
  parseMoney,
  upgradeDifference,
  upgradeIndicators,
  type Client,
  type PlanUpgrade,
  type ProfileOption,
} from "@/lib/commercial";
import { formatDateBR, getLocalDateInputValue } from "@/lib/date";
import { cn } from "@/lib/utils";

type UpForm = {
  client: ClientInput;
  clientId: string | null;
  previous_plan: string;
  new_plan: string;
  previous_value: string;
  new_value: string;
  upgrade_date: string;
  responsible_id: string;
  notes: string;
};

const PLAN_LIST_ID = "upgrade-plan-suggestions";

function DifferenceText({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "font-semibold whitespace-nowrap",
        value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {formatDifference(value)}
    </span>
  );
}

export function UpgradesPage() {
  const today = getLocalDateInputValue();
  const [items, setItems] = useState<PlanUpgrade[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [respFilter, setRespFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [form, setForm] = useState<UpForm | null>(null);
  const [editing, setEditing] = useState<PlanUpgrade | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyClientId, setHistoryClientId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PlanUpgrade | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ups, cls] = await Promise.all([
        commercialApi.listUpgrades(),
        commercialApi.listClients(),
      ]);
      setItems(ups);
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
    return commercialApi.subscribe("upgrades", ["plan_upgrades", "clients"], load);
  }, [load]);

  const profileName = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => {
      m[p.id] = p.full_name;
    });
    return (id: string | null) => (id ? (m[id] ?? "Usuário") : "—");
  }, [profiles]);

  const indicators = useMemo(() => upgradeIndicators(items, today), [items, today]);
  const plans = useMemo(
    () => knownPlans(items.flatMap((u) => [u.previous_plan, u.new_plan])),
    [items],
  );
  const filtered = useMemo(
    () => filterUpgrades(items, { search, plan: planFilter, responsibleId: respFilter, from, to }),
    [items, search, planFilter, respFilter, from, to],
  );
  const filteredRevenue = useMemo(
    () => filtered.reduce((s, u) => Math.round((s + upgradeDifference(u)) * 100) / 100, 0),
    [filtered],
  );
  const hasFilters = Boolean(search || planFilter !== "all" || respFilter !== "all" || from || to);
  const clearFilters = () => {
    setSearch("");
    setPlanFilter("all");
    setRespFilter("all");
    setFrom("");
    setTo("");
  };
  const monthRange = () => {
    const first = `${today.slice(0, 7)}-01`;
    const [y, m] = today.split("-").map(Number);
    const last = `${today.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    if (from === first && to === last) {
      setFrom("");
      setTo("");
    } else {
      setFrom(first);
      setTo(last);
    }
  };

  /* ---------------- formulário ---------------- */
  const openCreate = () => {
    setEditing(null);
    setForm({
      client: emptyClientInput(),
      clientId: null,
      previous_plan: "",
      new_plan: "",
      previous_value: "",
      new_value: "",
      upgrade_date: today,
      responsible_id: me ?? "",
      notes: "",
    });
  };
  const openEdit = (u: PlanUpgrade) => {
    setHistoryClientId(null);
    setEditing(u);
    setForm({
      client: clientToInput(u.client),
      clientId: u.client_id,
      previous_plan: u.previous_plan,
      new_plan: u.new_plan,
      previous_value: moneyInputValue(u.previous_value),
      new_value: moneyInputValue(u.new_value),
      upgrade_date: u.upgrade_date,
      responsible_id: u.responsible_id ?? "",
      notes: u.notes ?? "",
    });
  };
  const upd = <K extends keyof UpForm>(k: K, v: UpForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const prevValue = form ? parseMoney(form.previous_value) : null;
  const newValue = form ? parseMoney(form.new_value) : null;
  const diff =
    prevValue != null && newValue != null ? monthlyDifference(prevValue, newValue) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.client.name.trim()) return toast.error("Informe o nome do cliente.");
    if (cpfError(form.client.cpf)) return toast.error("CPF inválido.");
    if (prevValue == null || newValue == null)
      return toast.error("Informe valores válidos (ex.: 99,99).");
    setSaving(true);
    try {
      await commercialApi.saveUpgrade(
        form.client,
        {
          previous_plan: form.previous_plan,
          new_plan: form.new_plan,
          previous_value: prevValue,
          new_value: newValue,
          upgrade_date: form.upgrade_date,
          responsible_id: form.responsible_id,
          notes: form.notes,
        },
        editing,
        form.clientId,
      );
      toast.success(editing ? "Upgrade atualizado." : "Upgrade registrado.");
      setForm(null);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(friendlyDbError(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await commercialApi.deleteUpgrade(toDelete.id);
      toast.success("Registro de upgrade excluído.");
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(friendlyDbError(err));
    } finally {
      setDeleting(false);
    }
  };

  const history = historyClientId
    ? items
        .filter((u) => u.client_id === historyClientId)
        .sort(
          (a, b) =>
            a.upgrade_date.localeCompare(b.upgrade_date) ||
            a.created_at.localeCompare(b.created_at),
        )
    : [];
  const historyClient = history[0]?.client ?? null;
  const historyTotal = history.reduce(
    (s, u) => Math.round((s + upgradeDifference(u)) * 100) / 100,
    0,
  );

  const isThisMonth = from === `${today.slice(0, 7)}-01`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Rocket}
        title="Upgrades"
        subtitle="Clientes que aumentaram a velocidade do plano"
        action={
          <Button
            onClick={openCreate}
            className="bg-gradient-primary shadow-elegant hover:opacity-95"
          >
            <Plus className="h-4 w-4 mr-2" /> Registrar upgrade
          </Button>
        }
      />

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar os upgrades.</p>
            <p className="text-muted-foreground">{loadError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IndicatorCard
          index={0}
          icon={TrendingUp}
          label="Upgrades realizados"
          value={indicators.total}
          hint="Total registrado"
        />
        <IndicatorCard
          index={1}
          icon={CalendarCheck}
          tone="success"
          label="Upgrades no mês"
          value={indicators.noMes}
          hint="Clique para filtrar o mês atual"
          active={isThisMonth}
          onClick={monthRange}
        />
        <IndicatorCard
          index={2}
          icon={Wallet}
          tone="success"
          label="Aumento mensal de receita"
          value={formatMoney(indicators.receitaMensal)}
          hint="Soma de todas as diferenças"
        />
        <IndicatorCard
          index={3}
          icon={Trophy}
          tone="warning"
          label="Plano mais vendido"
          value={<span className="text-xl">{indicators.planoMaisVendido?.label ?? "—"}</span>}
          hint={
            indicators.planoMaisVendido
              ? `${indicators.planoMaisVendido.count} upgrade(s)`
              : "Sem registros"
          }
          active={planFilter !== "all" && planFilter === indicators.planoMaisVendido?.label}
          onClick={
            indicators.planoMaisVendido
              ? () =>
                  setPlanFilter(
                    planFilter === indicators.planoMaisVendido!.label
                      ? "all"
                      : indicators.planoMaisVendido!.label,
                  )
              : undefined
          }
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Pesquisa e filtros
            </h3>
          </div>
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Limpar
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar cliente por nome, nº do contrato, telefone ou CPF"
            className="pl-9"
            aria-label="Pesquisar upgrades"
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Plano</Label>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger aria-label="Filtrar por plano">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os planos</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Responsável</Label>
            <Select value={respFilter} onValueChange={setRespFilter}>
              <SelectTrigger aria-label="Filtrar por responsável">
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
          <div className="space-y-1.5">
            <Label className="text-xs">Upgrade de</Label>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Upgrade de"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Upgrade até</Label>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Upgrade até"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState>
          {items.length
            ? "Nenhum upgrade encontrado para os filtros selecionados."
            : "Nenhum upgrade registrado ainda."}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground" data-testid="upgrades-count">
              {filtered.length} {filtered.length === 1 ? "upgrade" : "upgrades"}
            </span>
            <span>
              Aumento mensal no resultado: <DifferenceText value={filteredRevenue} />
            </span>
          </div>
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Data</th>
                    <th className="text-left px-4 py-3">Cliente</th>
                    <th className="text-left px-4 py-3">Plano</th>
                    <th className="text-right px-4 py-3">Valor anterior</th>
                    <th className="text-right px-4 py-3">Novo valor</th>
                    <th className="text-right px-4 py-3">Diferença</th>
                    <th className="text-left px-4 py-3">Responsável</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((u) => (
                    <tr key={u.id} className="hover:bg-accent/20" data-testid="upgrade-row">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDateBR(u.upgrade_date)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-medium hover:text-primary"
                          onClick={() => setHistoryClientId(u.client_id)}
                        >
                          {u.client?.name ?? "—"}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {[
                            u.client?.client_code && `Contrato ${u.client.client_code}`,
                            u.client?.phone,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span className="text-muted-foreground">{u.previous_plan}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium">{u.new_plan}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {formatMoney(u.previous_value)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {formatMoney(u.new_value)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DifferenceText value={upgradeDifference(u)} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {profileName(u.responsible_id)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setHistoryClientId(u.client_id)}
                            title="Histórico de upgrades do cliente"
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(u)}
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setToDelete(u)}
                            title="Excluir"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-3 md:hidden">
            {filtered.map((u, i) => (
              <motion.article
                key={u.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                className="rounded-xl border border-border bg-card p-4 shadow-card space-y-2"
                data-testid="upgrade-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{u.client?.name ?? "—"}</h3>
                    <p className="text-xs text-muted-foreground">
                      {formatDateBR(u.upgrade_date)} · {profileName(u.responsible_id)}
                    </p>
                  </div>
                  <DifferenceText value={upgradeDifference(u)} />
                </div>
                <p className="text-sm flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground">
                    {u.previous_plan} ({formatMoney(u.previous_value)})
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">
                    {u.new_plan} ({formatMoney(u.new_value)})
                  </span>
                </p>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setHistoryClientId(u.client_id)}>
                    <History className="h-3.5 w-3.5 mr-1" />
                    Histórico
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setToDelete(u)}
                    className="text-destructive hover:text-destructive"
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
            <DialogTitle>{editing ? "Editar upgrade" : "Registrar upgrade"}</DialogTitle>
            <DialogDescription>
              A diferença de mensalidade é calculada automaticamente.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={submit} className="space-y-6" aria-label="Formulário de upgrade">
              <FormSection title="Cliente">
                <ClientFields
                  value={form.client}
                  onChange={(c) => upd("client", c)}
                  clients={clients}
                  selectedId={form.clientId}
                  onSelect={(c) => upd("clientId", c?.id ?? null)}
                  showAddress={false}
                />
              </FormSection>
              <FormSection title="Upgrade">
                <datalist id={PLAN_LIST_ID}>
                  {plans.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Plano anterior *">
                    <Input
                      required
                      list={PLAN_LIST_ID}
                      value={form.previous_plan}
                      onChange={(e) => upd("previous_plan", e.target.value)}
                      placeholder="Ex.: 300 Mega"
                    />
                  </Field>
                  <Field label="Novo plano contratado *">
                    <Input
                      required
                      list={PLAN_LIST_ID}
                      value={form.new_plan}
                      onChange={(e) => upd("new_plan", e.target.value)}
                      placeholder="Ex.: 600 Mega"
                    />
                  </Field>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field
                    label="Valor anterior (R$) *"
                    error={form.previous_value && prevValue == null ? "Valor inválido" : null}
                  >
                    <Input
                      required
                      inputMode="decimal"
                      value={form.previous_value}
                      onChange={(e) => upd("previous_value", e.target.value)}
                      onBlur={() =>
                        prevValue != null && upd("previous_value", moneyInputValue(prevValue))
                      }
                      placeholder="99,99"
                      aria-label="Valor anterior"
                    />
                  </Field>
                  <Field
                    label="Novo valor (R$) *"
                    error={form.new_value && newValue == null ? "Valor inválido" : null}
                  >
                    <Input
                      required
                      inputMode="decimal"
                      value={form.new_value}
                      onChange={(e) => upd("new_value", e.target.value)}
                      onBlur={() => newValue != null && upd("new_value", moneyInputValue(newValue))}
                      placeholder="119,99"
                      aria-label="Novo valor"
                    />
                  </Field>
                  <Field
                    label="Diferença de mensalidade"
                    hint={
                      diff != null && diff <= 0
                        ? "Atenção: o novo valor não é maior que o anterior."
                        : "Calculada automaticamente"
                    }
                  >
                    <div
                      className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm"
                      data-testid="difference-preview"
                    >
                      {diff == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <DifferenceText value={diff} />
                      )}
                    </div>
                  </Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Data do upgrade *">
                    <Input
                      type="date"
                      required
                      value={form.upgrade_date}
                      onChange={(e) => upd("upgrade_date", e.target.value)}
                    />
                  </Field>
                  <Field label="Responsável pela negociação">
                    <Select
                      value={form.responsible_id || NO_RESPONSIBLE}
                      onValueChange={(v) => upd("responsible_id", v === NO_RESPONSIBLE ? "" : v)}
                    >
                      <SelectTrigger aria-label="Responsável pela negociação">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_RESPONSIBLE}>Sem responsável</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Observações">
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
                    "Registrar upgrade"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Histórico de upgrades do cliente */}
      <Dialog
        open={Boolean(historyClientId)}
        onOpenChange={(o) => {
          if (!o) setHistoryClientId(null);
        }}
      >
        <DialogContent className="grid-cols-1 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de upgrades</DialogTitle>
            <DialogDescription>
              {historyClient?.name}
              {historyClient?.client_code ? ` · contrato ${historyClient.client_code}` : ""}
              {historyClient?.cpf ? ` · CPF ${formatCpf(historyClient.cpf)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <ol
            className="relative space-y-4 border-l border-border pl-5"
            data-testid="upgrade-history"
          >
            {history.map((u) => (
              <li key={u.id} className="relative">
                <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-gradient-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{formatDateBR(u.upgrade_date)}</span>
                  <DifferenceText value={upgradeDifference(u)} className="text-sm" />
                </div>
                <p className="text-sm">
                  {u.previous_plan} ({formatMoney(u.previous_value)}){" "}
                  <ArrowRight className="inline h-3.5 w-3.5 text-primary" />{" "}
                  <strong>{u.new_plan}</strong> ({formatMoney(u.new_value)})
                </p>
                <p className="text-xs text-muted-foreground">
                  Responsável: {profileName(u.responsible_id)}
                </p>
                {u.notes && (
                  <p className="text-xs text-muted-foreground italic mt-1 whitespace-pre-wrap">
                    {u.notes}
                  </p>
                )}
                <div className="mt-1 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3 text-sm">
            <span>{history.length} upgrade(s) · aumento mensal acumulado</span>
            <DifferenceText value={historyTotal} />
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Excluir registro de upgrade?"
        description={
          <>
            O upgrade de <strong>{toDelete?.client?.name}</strong> ({toDelete?.previous_plan} →{" "}
            {toDelete?.new_plan}) será excluído. Esta ação não pode ser desfeita.
          </>
        }
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
