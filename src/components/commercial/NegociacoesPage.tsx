import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Eye,
  Filter,
  Handshake,
  History,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  Hourglass,
  CheckCircle2,
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
  NegotiationStatusBadge,
  NextContactBadge,
  PageHeader,
} from "@/components/commercial/CommercialUi";
import { NO_RESPONSIBLE, clientToInput, cpfError, emptyClientInput } from "@/lib/commercial-form";
import { commercialApi, type ClientInput } from "@/lib/commercial-api";
import {
  CONTACT_TYPE_LABELS,
  MANUAL_CONTACT_TYPES,
  NEGOTIATION_REASONS,
  NEGOTIATION_STATUS_LABELS,
  OTHER_REASON,
  contactState,
  filterNegotiations,
  formatCpf,
  friendlyDbError,
  knownPlans,
  negotiationIndicators,
  normalizeText,
  sortNegotiations,
  type Client,
  type Negotiation,
  type NegotiationContact,
  type NegotiationStatus,
  type ProfileOption,
} from "@/lib/commercial";
import { formatDateBR, getLocalDateInputValue } from "@/lib/date";
import { cn } from "@/lib/utils";

type NegForm = {
  client: ClientInput;
  clientId: string | null;
  current_plan: string;
  interested_plan: string;
  status: NegotiationStatus;
  reasonChoice: string;
  customReason: string;
  responsible_id: string;
  contract_started_on: string;
  negotiation_started_on: string;
  notes: string;
};

const PLAN_LIST_ID = "negotiation-plan-suggestions";

function reasonToForm(reason: string) {
  const match = NEGOTIATION_REASONS.find((r) => normalizeText(r) === normalizeText(reason));
  return match
    ? { reasonChoice: match as string, customReason: "" }
    : { reasonChoice: OTHER_REASON, customReason: reason };
}

const nowLocalDateTime = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );

export function NegociacoesPage() {
  const today = getLocalDateInputValue();
  const [items, setItems] = useState<Negotiation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<NegotiationStatus | "all">("all");
  const [respFilter, setRespFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [onlyAwaiting, setOnlyAwaiting] = useState(false);

  // diálogos
  const [form, setForm] = useState<NegForm | null>(null);
  const [editing, setEditing] = useState<Negotiation | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Negotiation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const detailsRef = useRef<{ reloadContacts: () => void } | null>(null);

  const load = useCallback(async () => {
    try {
      const [negs, cls] = await Promise.all([
        commercialApi.listNegotiations(),
        commercialApi.listClients(),
      ]);
      setItems(negs);
      setClients(cls);
      setLoadError(null);
    } catch (err) {
      setLoadError(friendlyDbError(err));
    } finally {
      setLoading(false);
    }
    detailsRef.current?.reloadContacts();
  }, []);

  useEffect(() => {
    load();
    commercialApi.currentUserId().then(setMe);
    commercialApi
      .listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
    return commercialApi.subscribe(
      "negociacoes",
      ["negotiations", "negotiation_contacts", "clients"],
      load,
    );
  }, [load]);

  const profileName = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => {
      m[p.id] = p.full_name;
    });
    return (id: string | null) => (id ? (m[id] ?? "Usuário") : "—");
  }, [profiles]);

  const indicators = useMemo(() => negotiationIndicators(items, today), [items, today]);
  const filtered = useMemo(
    () =>
      sortNegotiations(
        filterNegotiations(items, {
          search,
          status: statusFilter,
          responsibleId: respFilter,
          from,
          to,
          onlyPending,
          onlyAwaitingReturn: onlyAwaiting,
          today,
        }),
        today,
      ),
    [items, search, statusFilter, respFilter, from, to, onlyPending, onlyAwaiting, today],
  );
  const plans = useMemo(
    () => knownPlans(items.flatMap((n) => [n.current_plan, n.interested_plan])),
    [items],
  );
  const hasFilters = Boolean(
    search ||
    statusFilter !== "all" ||
    respFilter !== "all" ||
    from ||
    to ||
    onlyPending ||
    onlyAwaiting,
  );
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setRespFilter("all");
    setFrom("");
    setTo("");
    setOnlyPending(false);
    setOnlyAwaiting(false);
  };

  /* ---------------- cadastro / edição ---------------- */
  const openCreate = () => {
    setEditing(null);
    setForm({
      client: emptyClientInput(),
      clientId: null,
      current_plan: "",
      interested_plan: "",
      status: "em_negociacao",
      reasonChoice: NEGOTIATION_REASONS[0],
      customReason: "",
      responsible_id: me ?? "",
      contract_started_on: "",
      negotiation_started_on: "",
      notes: "",
    });
  };

  const openEdit = (n: Negotiation) => {
    setDetailsId(null);
    setEditing(n);
    setForm({
      client: clientToInput(n.client),
      clientId: n.client_id,
      current_plan: n.current_plan ?? "",
      interested_plan: n.interested_plan ?? "",
      status: n.status,
      ...reasonToForm(n.reason),
      responsible_id: n.responsible_id ?? "",
      contract_started_on: n.contract_started_on ?? "",
      negotiation_started_on: n.negotiation_started_on ?? "",
      notes: n.notes ?? "",
    });
  };

  const upd = <K extends keyof NegForm>(k: K, v: NegForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const reason = (
      form.reasonChoice === OTHER_REASON ? form.customReason : form.reasonChoice
    ).trim();
    if (!form.client.name.trim()) return toast.error("Informe o nome do cliente.");
    if (cpfError(form.client.cpf)) return toast.error("CPF inválido.");
    if (!reason) return toast.error("Informe o motivo.");
    if (!form.contract_started_on) return toast.error("Informe a data de início do contrato.");
    setSaving(true);
    try {
      await commercialApi.saveNegotiation(
        form.client,
        {
          current_plan: form.current_plan,
          interested_plan: form.interested_plan,
          status: form.status,
          reason,
          responsible_id: form.responsible_id,
          contract_started_on: form.contract_started_on,
          negotiation_started_on: form.negotiation_started_on,
          notes: form.notes,
        },
        editing,
        form.clientId,
      );
      toast.success(editing ? "Cadastro atualizado." : "Cliente cadastrado em negociações.");
      setForm(null);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(friendlyDbError(err));
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- ações rápidas ---------------- */
  const changeStatus = async (n: Negotiation, status: NegotiationStatus) => {
    if (n.status === status) return;
    try {
      await commercialApi.setNegotiationStatus(n.id, status);
      toast.success(`Situação alterada para "${NEGOTIATION_STATUS_LABELS[status]}".`);
      load();
    } catch (err) {
      toast.error(friendlyDbError(err));
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await commercialApi.deleteNegotiation(toDelete.id);
      toast.success("Cadastro excluído.");
      setToDelete(null);
      setDetailsId(null);
      load();
    } catch (err) {
      toast.error(friendlyDbError(err));
    } finally {
      setDeleting(false);
    }
  };

  const details = detailsId ? (items.find((n) => n.id === detailsId) ?? null) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Handshake}
        title="Negociações"
        subtitle="Clientes em negociação e bloqueados"
        action={
          <Button
            onClick={openCreate}
            className="bg-gradient-primary shadow-elegant hover:opacity-95"
          >
            <Plus className="h-4 w-4 mr-2" /> Nova negociação
          </Button>
        }
      />

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar as negociações.</p>
            <p className="text-muted-foreground">{loadError}</p>
          </div>
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IndicatorCard
          index={0}
          icon={Handshake}
          label="Total em negociação"
          value={indicators.emNegociacao}
          active={statusFilter === "em_negociacao"}
          onClick={() =>
            setStatusFilter(statusFilter === "em_negociacao" ? "all" : "em_negociacao")
          }
        />
        <IndicatorCard
          index={1}
          icon={Ban}
          tone="destructive"
          label="Total de bloqueados"
          value={indicators.bloqueados}
          active={statusFilter === "bloqueado"}
          onClick={() => setStatusFilter(statusFilter === "bloqueado" ? "all" : "bloqueado")}
        />
        <IndicatorCard
          index={2}
          icon={Hourglass}
          tone="warning"
          label="Aguardando retorno"
          value={indicators.aguardandoRetorno}
          hint="Motivo: aguardando retorno do cliente"
          active={onlyAwaiting}
          onClick={() => setOnlyAwaiting(!onlyAwaiting)}
        />
        <IndicatorCard
          index={3}
          icon={CalendarClock}
          tone={indicators.atrasados ? "destructive" : "success"}
          label="Contatos pendentes"
          value={indicators.contatosPendentes}
          hint={
            indicators.atrasados ? (
              <span className="text-destructive font-medium">
                {indicators.atrasados} atrasado(s)
              </span>
            ) : (
              "Nenhum contato atrasado"
            )
          }
          active={onlyPending}
          onClick={() => setOnlyPending(!onlyPending)}
        />
      </div>

      {/* Filtros */}
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
            placeholder="Pesquisar por nome, telefone, nº do contrato ou CPF"
            className="pl-9"
            aria-label="Pesquisar negociações"
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Situação</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as NegotiationStatus | "all")}
            >
              <SelectTrigger aria-label="Filtrar por situação">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(Object.keys(NEGOTIATION_STATUS_LABELS) as NegotiationStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {NEGOTIATION_STATUS_LABELS[s]}
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
            <Label className="text-xs">Cadastro de</Label>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Cadastro de"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cadastro até</Label>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Cadastro até"
            />
          </div>
          <label className="col-span-2 lg:col-span-1 flex items-center gap-2 self-end rounded-md border border-input px-3 h-9 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="accent-primary"
            />
            Só contatos pendentes
          </label>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState>
          {items.length
            ? "Nenhum cliente encontrado para os filtros selecionados."
            : "Nenhum cliente em negociação cadastrado ainda."}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="negotiations-count">
            {filtered.length} {filtered.length === 1 ? "cliente" : "clientes"}
          </p>
          {/* Desktop: tabela */}
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Cliente</th>
                    <th className="text-left px-4 py-3">Situação</th>
                    <th className="text-left px-4 py-3">Motivo</th>
                    <th className="text-left px-4 py-3">Responsável</th>
                    <th className="text-left px-4 py-3">Início do contrato</th>
                    <th className="text-left px-4 py-3">Em negociação desde</th>
                    <th className="text-left px-4 py-3">Próximo contato</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((n) => (
                    <tr
                      key={n.id}
                      className={cn(
                        "hover:bg-accent/20",
                        contactState(n, today) === "atrasado" && "bg-destructive/5",
                      )}
                      data-testid="negotiation-row"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-medium hover:text-primary"
                          onClick={() => setDetailsId(n.id)}
                        >
                          {n.client?.name ?? "—"}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {[
                            n.client?.client_code && `Contrato ${n.client.client_code}`,
                            n.client?.phone,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <NegotiationStatusBadge status={n.status} />
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <p className="line-clamp-2">{n.reason}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {profileName(n.responsible_id)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {n.contract_started_on ? formatDateBR(n.contract_started_on) : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {n.negotiation_started_on ? formatDateBR(n.negotiation_started_on) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <NextContactBadge date={n.next_contact_on} state={contactState(n, today)} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailsId(n.id)}
                            title="Detalhes e histórico"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(n)}
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setToDelete(n)}
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
          {/* Celular: cartões */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((n, i) => (
              <motion.article
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 shadow-card space-y-2",
                  contactState(n, today) === "atrasado" && "border-destructive/40",
                )}
                data-testid="negotiation-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{n.client?.name ?? "—"}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {[
                        n.client?.client_code && `Contrato ${n.client.client_code}`,
                        n.client?.phone,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <NegotiationStatusBadge status={n.status} />
                </div>
                <p className="text-sm">{n.reason}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Início do contrato:{" "}
                    {n.contract_started_on ? formatDateBR(n.contract_started_on) : "—"}
                  </span>
                  <span>
                    Em negociação desde:{" "}
                    {n.negotiation_started_on ? formatDateBR(n.negotiation_started_on) : "—"}
                  </span>
                  <span>Resp.: {profileName(n.responsible_id)}</span>
                  <span className="flex items-center gap-1">
                    Próx.:{" "}
                    <NextContactBadge date={n.next_contact_on} state={contactState(n, today)} />
                  </span>
                </div>
                <div className="flex justify-end gap-1 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setDetailsId(n.id)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Detalhes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(n)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setToDelete(n)}
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
            <DialogTitle>{editing ? "Editar negociação" : "Nova negociação"}</DialogTitle>
            <DialogDescription>Campos com * são obrigatórios.</DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={submit} className="space-y-6" aria-label="Formulário de negociação">
              <FormSection title="Cliente">
                <ClientFields
                  value={form.client}
                  onChange={(c) => upd("client", c)}
                  clients={clients}
                  selectedId={form.clientId}
                  onSelect={(c) => upd("clientId", c?.id ?? null)}
                  requirePhone
                />
              </FormSection>

              <FormSection title="Negociação">
                <datalist id={PLAN_LIST_ID}>
                  {plans.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Plano atual">
                    <Input
                      list={PLAN_LIST_ID}
                      value={form.current_plan}
                      onChange={(e) => upd("current_plan", e.target.value)}
                      placeholder="Ex.: 300 Mega"
                    />
                  </Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Situação do cliente *">
                    <Select
                      value={form.status}
                      onValueChange={(v) => upd("status", v as NegotiationStatus)}
                    >
                      <SelectTrigger aria-label="Situação do cliente">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="em_negociacao">Em negociação</SelectItem>
                        <SelectItem value="bloqueado">Bloqueado</SelectItem>
                        {editing && (
                          <SelectItem value="convertido">Convertido em contratação</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Motivo *">
                    <Select value={form.reasonChoice} onValueChange={(v) => upd("reasonChoice", v)}>
                      <SelectTrigger aria-label="Motivo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NEGOTIATION_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                        {/* Registro antigo com motivo fora da lista atual: mantém o motivo gravado como opção. */}
                        {form.customReason && (
                          <SelectItem value={OTHER_REASON}>
                            {form.customReason} (motivo anterior)
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Responsável pelo atendimento">
                    <Select
                      value={form.responsible_id || NO_RESPONSIBLE}
                      onValueChange={(v) => upd("responsible_id", v === NO_RESPONSIBLE ? "" : v)}
                    >
                      <SelectTrigger aria-label="Responsável pelo atendimento">
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
                  <Field label="Data de início do contrato *">
                    <Input
                      type="date"
                      required
                      value={form.contract_started_on}
                      onChange={(e) => upd("contract_started_on", e.target.value)}
                    />
                  </Field>
                  <Field label="Data que ficou em negociação">
                    <Input
                      type="date"
                      value={form.negotiation_started_on}
                      onChange={(e) => upd("negotiation_started_on", e.target.value)}
                    />
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
                    "Cadastrar"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Detalhes + histórico */}
      <Dialog
        open={Boolean(details)}
        onOpenChange={(o) => {
          if (!o) setDetailsId(null);
        }}
      >
        <DialogContent className="grid-cols-1 max-w-3xl max-h-[90vh] overflow-y-auto">
          {details && (
            <NegotiationDetails
              ref={detailsRef}
              n={details}
              today={today}
              responsibleName={profileName(details.responsible_id)}
              authorName={profileName}
              onEdit={() => openEdit(details)}
              onDelete={() => setToDelete(details)}
              onStatus={(s) => changeStatus(details, s)}
              onChanged={load}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Excluir cadastro de negociação?"
        description={
          <>
            O registro de <strong>{toDelete?.client?.name}</strong> e todo o histórico de contatos
            serão excluídos. Esta ação não pode ser desfeita.
          </>
        }
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */

type DetailsProps = {
  n: Negotiation;
  today: string;
  responsibleName: string;
  authorName: (id: string | null) => string;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (s: NegotiationStatus) => void;
  onChanged: () => void;
};

const NegotiationDetails = forwardRef<{ reloadContacts: () => void }, DetailsProps>(
  function NegotiationDetails(
    { n, today, responsibleName, authorName, onEdit, onDelete, onStatus, onChanged },
    ref,
  ) {
    const [contacts, setContacts] = useState<NegotiationContact[] | null>(null);
    const [type, setType] = useState<string>("telefone");
    const [when, setWhen] = useState(nowLocalDateTime());
    const [description, setDescription] = useState("");
    const [nextContact, setNextContact] = useState(n.next_contact_on ?? "");
    const [saving, setSaving] = useState(false);

    const reloadContacts = useCallback(() => {
      commercialApi
        .listContacts(n.id)
        .then(setContacts)
        .catch((err) => {
          setContacts([]);
          toast.error(friendlyDbError(err));
        });
    }, [n.id]);
    useImperativeHandle(ref, () => ({ reloadContacts }), [reloadContacts]);
    useEffect(() => {
      reloadContacts();
    }, [reloadContacts]);
    useEffect(() => {
      setNextContact(n.next_contact_on ?? "");
    }, [n.next_contact_on]);

    const addContact = async (e: FormEvent) => {
      e.preventDefault();
      if (!description.trim()) return toast.error("Descreva o contato ou a observação.");
      setSaving(true);
      try {
        await commercialApi.addContact({
          negotiation_id: n.id,
          contact_type: type,
          description,
          contacted_at: new Date(when).toISOString(),
        });
        if ((nextContact || null) !== (n.next_contact_on || null))
          await commercialApi.setNextContact(n.id, nextContact || null);
        toast.success("Contato registrado no histórico.");
        setDescription("");
        setWhen(nowLocalDateTime());
        reloadContacts();
        onChanged();
      } catch (err) {
        toast.error(friendlyDbError(err));
      } finally {
        setSaving(false);
      }
    };

    const c = n.client;
    const state = contactState(n, today);
    const info: Array<[string, React.ReactNode]> = [
      ["Número do contrato", c?.client_code || "—"],
      ["CPF", c?.cpf ? formatCpf(c.cpf) : "—"],
      ["Telefone / WhatsApp", c?.phone || "—"],
      ["Endereço", [c?.address, c?.neighborhood].filter(Boolean).join(" — ") || "—"],
      ["Plano atual", n.current_plan || "—"],
      ["Plano de interesse", n.interested_plan || "—"],
      ["Motivo", n.reason],
      ["Responsável", responsibleName],
      [
        "Data de início do contrato",
        n.contract_started_on ? formatDateBR(n.contract_started_on) : "Não informada",
      ],
      [
        "Data que ficou em negociação",
        n.negotiation_started_on ? formatDateBR(n.negotiation_started_on) : "Não informada",
      ],
      [
        "Próximo contato (retorno)",
        <NextContactBadge key="nc" date={n.next_contact_on} state={state} />,
      ],
      ["Registro criado em", formatDateBR(n.registered_on)],
    ];
    if (n.converted_at) info.push(["Convertido em", formatDateTime(n.converted_at)]);

    return (
      <div className="space-y-6">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <DialogTitle className="text-xl">{c?.name ?? "Cliente"}</DialogTitle>
            <NegotiationStatusBadge status={n.status} />
          </div>
          <DialogDescription>Detalhes do cliente e histórico de contatos</DialogDescription>
        </DialogHeader>

        {state === "atrasado" && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> Próximo contato atrasado desde{" "}
            {formatDateBR(n.next_contact_on)}.
          </div>
        )}

        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {info.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {n.notes && (
          <div className="rounded-lg bg-muted/30 p-3 text-sm whitespace-pre-wrap">
            <span className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
              Observações
            </span>
            {n.notes}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Alterar situação</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={n.status === "em_negociacao" ? "default" : "outline"}
              onClick={() => onStatus("em_negociacao")}
            >
              <Handshake className="h-3.5 w-3.5 mr-1" />
              Em negociação
            </Button>
            <Button
              size="sm"
              variant={n.status === "bloqueado" ? "destructive" : "outline"}
              onClick={() => onStatus("bloqueado")}
            >
              <Ban className="h-3.5 w-3.5 mr-1" />
              Bloqueado
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(n.status === "convertido" && "border-success text-success")}
              onClick={() => onStatus("convertido")}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Convertido em contratação
            </Button>
          </div>
        </div>

        <section className="space-y-3">
          <h4 className="flex items-center gap-2 font-semibold">
            <History className="h-4 w-4 text-primary" />
            Histórico de contatos
          </h4>
          <form
            onSubmit={addContact}
            className="rounded-xl border border-border bg-muted/20 p-4 space-y-3"
            aria-label="Registrar contato"
          >
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Tipo">
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger aria-label="Tipo de contato">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_CONTACT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {CONTACT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Data e hora">
                <Input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  required
                />
              </Field>
              <Field label="Próximo contato">
                <Input
                  type="date"
                  value={nextContact}
                  onChange={(e) => setNextContact(e.target.value)}
                  aria-label="Agendar próximo contato"
                />
              </Field>
            </div>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que foi conversado / observação"
              aria-label="Descrição do contato"
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saving} className="bg-gradient-primary">
                <MessageSquarePlus className="h-4 w-4 mr-1" />
                {saving ? "Registrando..." : "Registrar contato"}
              </Button>
            </div>
          </form>
          {contacts === null ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum contato registrado.</p>
          ) : (
            <ol
              className="relative space-y-3 border-l border-border pl-5"
              data-testid="contact-history"
            >
              {contacts.map((ct) => (
                <li key={ct.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full",
                      ct.contact_type === "situacao" ? "bg-warning" : "bg-primary",
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {CONTACT_TYPE_LABELS[ct.contact_type] ?? ct.contact_type}
                    </span>
                    <span>{formatDateTime(ct.contacted_at)}</span>
                    <span className="flex items-center gap-1">
                      <UserRound className="h-3 w-3" />
                      {authorName(ct.created_by)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{ct.description}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 border-t border-border pt-4">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Excluir cadastro
          </Button>
          <div className="flex flex-col sm:flex-row gap-2">
            {c?.phone && (
              <Button variant="outline" asChild>
                <a
                  href={`https://wa.me/55${c.phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Phone className="h-4 w-4 mr-1" />
                  WhatsApp
                </a>
              </Button>
            )}
            {c?.address && (
              <Button variant="outline" asChild>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.address, c.neighborhood].filter(Boolean).join(", "))}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin className="h-4 w-4 mr-1" />
                  Mapa
                </a>
              </Button>
            )}
            <Button onClick={onEdit} className="bg-gradient-primary">
              <Pencil className="h-4 w-4 mr-1" />
              Editar cadastro
            </Button>
          </div>
        </div>
      </div>
    );
  },
);
