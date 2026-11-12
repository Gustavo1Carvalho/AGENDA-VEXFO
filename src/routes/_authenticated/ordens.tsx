import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Search, MapPin, Phone, Trash2, ExternalLink, Eye, Pencil, ListChecks, User, Clock, AlertTriangle, Filter } from "lucide-react";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/app/PageKit";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDateBR, getLocalDateInputValue } from "@/lib/date";
import { StatusBadge } from "@/components/StatusBadge";
import {
  SERVICE_TYPE_LABELS, SERVICE_STATUS_LABELS, STATUS_ACCENT, formatPhone,
  type ServiceOrder, type ServiceStatus, type ServiceType,
} from "@/lib/orders";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ordens")({
  component: OrdensPage,
});

interface Tecnico { id: string; full_name: string; }

type OrderForm = {
  client_name: string;
  client_phone: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
  service_type: ServiceType;
  scheduled_date: string;
  scheduled_time: string;
  technician_id: string;
  status: ServiceStatus;
  notes: string;
};

function toForm(o: ServiceOrder): OrderForm {
  return {
    client_name: o.client_name ?? "",
    client_phone: o.client_phone ?? "",
    address: o.address ?? "",
    neighborhood: o.neighborhood ?? "",
    city: o.city ?? "",
    state: o.state ?? "",
    reference: o.reference ?? "",
    service_type: o.service_type,
    scheduled_date: o.scheduled_date,
    scheduled_time: o.scheduled_time?.slice(0, 5) ?? "09:00",
    technician_id: o.technician_id ?? "",
    status: o.status,
    notes: o.notes ?? "",
  };
}

/**
 * /ordens/$id é rota filha de /ordens: sem o Outlet a tela de detalhe nunca aparecia
 * (o botão "Detalhes" mantinha a lista). Na URL de uma OS, exibe o detalhe.
 */
function OrdensPage() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return pathname.replace(/\/+$/, "") === "/ordens" ? <OrdensListPage /> : <Outlet />;
}

function OrdensListPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | "all">("all");
  const [editing, setEditing] = useState<ServiceOrder | null>(null);
  const [editForm, setEditForm] = useState<OrderForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const today = getLocalDateInputValue();

  const load = async () => {
    const { data } = await supabase
      .from("service_orders").select("*")
      .order("scheduled_date", { ascending: false })
      .order("scheduled_time", { ascending: false });
    const ords = (data ?? []) as ServiceOrder[];
    setOrders(ords);
    setLoaded(true);

    const { data: techRoles } = await supabase.from("user_roles").select("user_id").eq("role", "tecnico");
    const techIds = (techRoles ?? []).map((r) => r.user_id);
    const ids = Array.from(new Set([
      ...(ords.map((o) => o.technician_id).filter(Boolean) as string[]),
      ...techIds,
    ]));

    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p) => { map[p.id] = p.full_name; });
      setProfiles(map);
      setTecnicos(techIds.map((id) => ({ id, full_name: map[id] ?? "Técnico" })).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    }
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("orders-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      return [o.client_name, o.neighborhood, o.address, o.client_phone].some((f) =>
        f?.toLowerCase().includes(q),
      );
    });
  }, [orders, search, statusFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta ordem de serviço?")) return;
    const { error } = await supabase.from("service_orders").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Excluída");
  };

  const openEdit = (order: ServiceOrder) => {
    setEditing(order);
    setEditForm(toForm(order));
  };

  const updateEdit = <K extends keyof OrderForm>(key: K, value: OrderForm[K]) => {
    setEditForm((current) => current ? { ...current, [key]: value } : current);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    setSaving(true);
    const payload = {
      client_name: editForm.client_name,
      client_phone: editForm.client_phone,
      address: editForm.address,
      neighborhood: editForm.neighborhood,
      city: editForm.city || null,
      state: editForm.state || null,
      reference: editForm.reference || null,
      service_type: editForm.service_type,
      scheduled_date: editForm.scheduled_date,
      scheduled_time: editForm.scheduled_time,
      technician_id: editForm.technician_id || null,
      status: editForm.status,
      notes: editForm.notes || null,
      updated_at: new Date().toISOString(),
      completed_at: editForm.status === "finalizado" ? (editing.completed_at ?? new Date().toISOString()) : null,
    };

    const { error } = await supabase.from("service_orders").update(payload).eq("id", editing.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Ordem atualizada com sucesso");
    setEditing(null);
    setEditForm(null);
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={ListChecks} title="Ordens de Serviço" subtitle="Histórico completo de atendimentos" />

      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, bairro, endereço..." className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar por status">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {(Object.keys(SERVICE_STATUS_LABELS) as ServiceStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{SERVICE_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loaded && filtered.length > 0 && (
        <p className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "ordem" : "ordens"}</p>
      )}

      <div className="grid gap-3">
        {!loaded && <ListSkeleton rows={4} />}
        {loaded && filtered.length === 0 && (
          <EmptyState icon={ListChecks}>Nenhuma ordem encontrada.</EmptyState>
        )}
        {filtered.map((o, i) => {
          const open = o.status !== "finalizado" && o.status !== "cancelado";
          const late = open && o.scheduled_date < today;
          return (
          <motion.article
            key={o.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
            className="relative overflow-hidden rounded-xl border border-border bg-card p-4 pl-5 shadow-card transition-shadow hover:shadow-glow sm:p-5 sm:pl-6"
          >
            <span className={cn("absolute inset-y-0 left-0 w-1", STATUS_ACCENT[o.status])} aria-hidden />
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                  <span className="text-[10px] font-medium uppercase">{formatDateBR(o.scheduled_date, { day: "2-digit", month: "short" })}</span>
                  <span className="text-sm font-semibold tabular-nums">{o.scheduled_time.slice(0,5)}</span>
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{o.client_name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                      {SERVICE_TYPE_LABELS[o.service_type]}
                    </span>
                    {open && o.scheduled_date === today && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><Clock className="h-3 w-3" />Hoje</span>
                    )}
                    {late && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><AlertTriangle className="h-3 w-3" />Atrasada</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span>{o.address} — {o.neighborhood}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {formatPhone(o.client_phone)}</span>
                    {o.technician_id && profiles[o.technician_id] ? (
                      <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Técnico: <strong className="font-medium text-foreground">{profiles[o.technician_id]}</strong></span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">Aguardando técnico</span>
                    )}
                  </div>
                  {o.notes && <p className="text-xs text-muted-foreground italic">&quot;{o.notes}&quot;</p>}
                </div>
              </div>

              <div className="flex flex-row items-center justify-between gap-2 border-t border-border pt-3 lg:flex-col lg:items-end lg:border-0 lg:pt-0 shrink-0">
                <StatusBadge status={o.status} />
                <div className="flex flex-wrap justify-end gap-1">
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/ordens/$id" params={{ id: o.id }}>
                      <Eye className="h-3.5 w-3.5 mr-1" />Detalhes
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />Editar
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([o.address, o.neighborhood, o.city, o.state].filter(Boolean).join(", "))}`}
                      target="_blank" rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />Rota
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(o.id)} className="text-destructive hover:text-destructive" aria-label="Excluir">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.article>
          );
        })}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) { setEditing(null); setEditForm(null); } }}>
        <DialogContent className="grid-cols-1 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Ordem de Serviço</DialogTitle>
          </DialogHeader>
          {editForm && (
            <form onSubmit={saveEdit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nome do cliente *"><Input required value={editForm.client_name} onChange={(e) => updateEdit("client_name", e.target.value)} /></Field>
                <Field label="Telefone *"><Input required value={editForm.client_phone} onChange={(e) => updateEdit("client_phone", e.target.value)} /></Field>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2"><Field label="Endereço *"><Input required value={editForm.address} onChange={(e) => updateEdit("address", e.target.value)} /></Field></div>
                <Field label="Bairro *"><Input required value={editForm.neighborhood} onChange={(e) => updateEdit("neighborhood", e.target.value)} /></Field>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2"><Field label="Cidade"><Input value={editForm.city} onChange={(e) => updateEdit("city", e.target.value)} /></Field></div>
                <Field label="Estado"><Input value={editForm.state} onChange={(e) => updateEdit("state", e.target.value.toUpperCase().slice(0,2))} maxLength={2} /></Field>
              </div>
              <Field label="Referência"><Input value={editForm.reference} onChange={(e) => updateEdit("reference", e.target.value)} /></Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Tipo de serviço">
                  <Select value={editForm.service_type} onValueChange={(v) => updateEdit("service_type", v as ServiceType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((k) => <SelectItem key={k} value={k}>{SERVICE_TYPE_LABELS[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={editForm.status} onValueChange={(v) => updateEdit("status", v as ServiceStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SERVICE_STATUS_LABELS) as ServiceStatus[]).map((s) => <SelectItem key={s} value={s}>{SERVICE_STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Data"><Input type="date" required value={editForm.scheduled_date} onChange={(e) => updateEdit("scheduled_date", e.target.value)} /></Field>
                <Field label="Horário"><Input type="time" required value={editForm.scheduled_time} onChange={(e) => updateEdit("scheduled_time", e.target.value)} /></Field>
                <Field label="Técnico responsável">
                  <Select value={editForm.technician_id || "unassigned"} onValueChange={(v) => updateEdit("technician_id", v === "unassigned" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Disponível para todos</SelectItem>
                      {tecnicos.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Observações"><Textarea rows={3} value={editForm.notes} onChange={(e) => updateEdit("notes", e.target.value)} /></Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setEditing(null); setEditForm(null); }}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="bg-gradient-primary">{saving ? "Salvando..." : "Salvar alterações"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-[13px] font-medium text-foreground/90">{label}</Label>{children}</div>;
}
