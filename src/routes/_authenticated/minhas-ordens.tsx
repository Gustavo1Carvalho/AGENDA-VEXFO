import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Phone, Clock, ExternalLink, PlayCircle, Truck, Navigation, CheckCircle2, Router, Wrench, CalendarCheck } from "lucide-react";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/app/PageKit";
import { cn } from "@/lib/utils";
import { RouterSwapDialog } from "@/components/operations/RouterSwapDialog";
import { operationsApi } from "@/lib/operations-api";
import { requiresRouterSwapReason, routerSwapReasonText, type RouterSwap } from "@/lib/operations";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { SERVICE_TYPE_LABELS, STATUS_ACCENT, formatPhone, type ServiceOrder, type ServiceStatus } from "@/lib/orders";
import { formatDateBR, getLocalDateInputValue } from "@/lib/date";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/minhas-ordens")({
  component: MinhasOrdensPage,
});

function MinhasOrdensPage() {
  const { user, fullName } = useAuth();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  // Motivo da troca de roteador (somente OS de troca). Se a tabela ainda não existir
  // no banco, o fluxo anterior de finalização é mantido.
  const [swaps, setSwaps] = useState<Record<string, RouterSwap>>({});
  const [swapsAvailable, setSwapsAvailable] = useState(false);
  const [swapDialog, setSwapDialog] = useState<{ order: ServiceOrder; finalize: boolean } | null>(null);

  const loadSwaps = async (list: ServiceOrder[]) => {
    const ids = list.filter((o) => requiresRouterSwapReason(o) && o.technician_id === user?.id).map((o) => o.id);
    try {
      // Sem OS de troca, consulta um id inexistente só para confirmar que a tabela existe.
      const rows = await operationsApi.listRouterSwaps(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      setSwaps(Object.fromEntries(rows.map((s) => [s.service_order_id, s])));
      setSwapsAvailable(true);
    } catch {
      setSwapsAvailable(false);
    }
  };

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_orders").select("*")
      .or(`technician_id.eq.${user.id},technician_id.is.null`)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true });
    setOrders((data ?? []) as ServiceOrder[]);
    setLoading(false);
    loadSwaps((data ?? []) as ServiceOrder[]);
  };

  const openSwap = (order: ServiceOrder, finalize: boolean) => setSwapDialog({ order, finalize });

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase.channel("my-orders")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "service_orders" },
        (payload) => {
          load();
          if (payload.eventType === "INSERT") {
            const ord = payload.new as ServiceOrder;
            if (!ord.technician_id || ord.technician_id === user.id) {
              toast.success(`Novo atendimento: ${SERVICE_TYPE_LABELS[ord.service_type]} às ${ord.scheduled_time.slice(0,5)} no bairro ${ord.neighborhood}`, {
                duration: 8000,
              });
              try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=").play().catch(() => {}); } catch {}
            }
          }
        }
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const updateStatus = async (id: string, status: ServiceStatus, extra: Partial<ServiceOrder> = {}) => {
    if (!user) return;

    let query = supabase.from("service_orders").update({ status, ...extra }).eq("id", id);

    if (status === "aceito") {
      query = query.eq("status", "pendente").or(`technician_id.is.null,technician_id.eq.${user.id}`);
    }

    const { data, error } = await query.select("id");
    if (error) {
      toast.error(error.message);
      return;
    }

    if (status === "aceito" && (!data || data.length === 0)) {
      toast.error("Esta ordem já foi aceita por outro técnico.");
      load();
      return;
    }

    toast.success(status === "aceito" ? "Atendimento aceito com sucesso" : "Status atualizado");
  };

  const today = getLocalDateInputValue();
  const todays = orders.filter((o) => o.scheduled_date === today && o.status !== "finalizado" && o.status !== "cancelado");
  const upcoming = orders.filter((o) => o.scheduled_date > today && o.status !== "finalizado" && o.status !== "cancelado");

  return (
    <div className="space-y-7">
      <PageHeader icon={Wrench} eyebrow={`Olá, ${fullName?.split(" ")[0] || "Técnico"}`} title="Meus atendimentos" subtitle="Seus serviços de hoje e os próximos agendados" />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : (
        <Section title="Hoje" count={todays.length}>
          {todays.length === 0 ? <Empty msg="Sem atendimentos para hoje. Bom descanso!" /> : todays.map((o) => (
            <OrderCard key={o.id} order={o} currentUserId={user?.id} onAction={updateStatus}
              swap={swaps[o.id] ?? null} onRouterSwap={swapsAvailable ? openSwap : undefined} />
          ))}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Próximos" count={upcoming.length}>
          {upcoming.map((o) => <OrderCard key={o.id} order={o} currentUserId={user?.id} onAction={updateStatus}
            swap={swaps[o.id] ?? null} onRouterSwap={swapsAvailable ? openSwap : undefined} />)}
        </Section>
      )}

      <RouterSwapDialog
        open={Boolean(swapDialog)}
        orderId={swapDialog?.order.id ?? null}
        clientName={swapDialog?.order.client_name}
        existing={swapDialog ? swaps[swapDialog.order.id] ?? null : null}
        mode={swapDialog?.finalize ? "finalize" : "edit"}
        onOpenChange={(o) => { if (!o) setSwapDialog(null); }}
        onSaved={async () => {
          const current = swapDialog;
          if (!current) return;
          await loadSwaps(orders);
          if (current.finalize) {
            await updateStatus(current.order.id, "finalizado", { completed_at: new Date().toISOString() });
          }
        }}
      />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2.5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">{count}</span>
      </header>
      <div className="grid gap-3 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="lg:col-span-2">
      <EmptyState icon={CalendarCheck}>{msg}</EmptyState>
    </div>
  );
}

function OrderCard({ order, currentUserId, onAction, swap = null, onRouterSwap }: {
  order: ServiceOrder; currentUserId?: string; onAction: (id: string, s: ServiceStatus, e?: Partial<ServiceOrder>) => void;
  swap?: RouterSwap | null; onRouterSwap?: (order: ServiceOrder, finalize: boolean) => void;
}) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.address}, ${order.neighborhood}`)}`;
  // Troca de roteador: o motivo é obrigatório antes de finalizar (demais OS seguem o fluxo normal).
  const needsSwapReason = Boolean(onRouterSwap) && requiresRouterSwapReason(order);
  const inProgress = ["aceito", "em_deslocamento", "em_atendimento"].includes(order.status);
  const primaryCls = "h-11 w-full text-sm font-semibold";

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-4 pl-5 shadow-card sm:p-5 sm:pl-6"
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", STATUS_ACCENT[order.status])} aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-primary font-semibold">{SERVICE_TYPE_LABELS[order.service_type]}</p>
          <h3 className="text-lg font-semibold leading-snug">{order.client_name}</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!order.technician_id && <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Disponível para equipe</Badge>}
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-primary" /> <span className="font-medium text-foreground">{formatDateBR(order.scheduled_date)} às {order.scheduled_time.slice(0,5)}</span></p>
        <p className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary" /><span>{order.address} — <strong className="text-foreground">{order.neighborhood}</strong>{order.reference && <span className="block text-xs">Ref: {order.reference}</span>}</span></p>
        <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-primary" /> {formatPhone(order.client_phone)}</p>
        {order.notes && <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs italic">"{order.notes}"</p>}
        {needsSwapReason && (
          <p className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-xs", swap ? "bg-primary/5" : "bg-amber-50 ring-1 ring-inset ring-amber-200")} data-testid="swap-reason">
            <Router className={cn("h-4 w-4 shrink-0", swap ? "text-primary" : "text-amber-600")} />
            {swap ? (
              <span>Motivo da troca: <strong className="text-foreground">{routerSwapReasonText(swap)}</strong></span>
            ) : (
              <span className="text-amber-700 font-medium">Motivo da troca do roteador obrigatório para finalizar.</span>
            )}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        {order.status === "pendente" && (
          <Button className={cn(primaryCls, "bg-gradient-primary")} onClick={() => onAction(order.id, "aceito", { technician_id: currentUserId })}>
            <PlayCircle className="h-4 w-4 mr-1" />Aceitar
          </Button>
        )}
        {order.status === "aceito" && (
          <Button className={cn(primaryCls, "bg-gradient-primary")} onClick={() => onAction(order.id, "em_deslocamento")}>
            <Truck className="h-4 w-4 mr-1" />Indo ao local
          </Button>
        )}
        {order.status === "em_deslocamento" && (
          <Button className={cn(primaryCls, "bg-gradient-primary")} onClick={() => onAction(order.id, "em_atendimento", { started_at: new Date().toISOString() })}>
            <Navigation className="h-4 w-4 mr-1" />Cheguei
          </Button>
        )}
        {order.status === "em_atendimento" && (
          <Button className={cn(primaryCls, "bg-success text-success-foreground hover:bg-success/90")} onClick={() => {
            if (needsSwapReason && !swap) onRouterSwap?.(order, true);
            else onAction(order.id, "finalizado", { completed_at: new Date().toISOString() });
          }}>
            <CheckCircle2 className="h-4 w-4 mr-1" />Finalizar
          </Button>
        )}
        {needsSwapReason && inProgress && order.technician_id === currentUserId && (
          <Button variant="outline" className="h-10 w-full" onClick={() => onRouterSwap?.(order, false)}>
            <Router className="h-4 w-4 mr-1" />{swap ? "Alterar motivo da troca" : "Motivo da troca"}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-10" asChild>
            <a href={mapUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Abrir rota</a>
          </Button>
          <Button variant="outline" className="h-10" asChild>
            <a href={`tel:${order.client_phone}`}><Phone className="h-4 w-4 mr-1" />Ligar</a>
          </Button>
        </div>
      </div>
    </motion.article>
  );
}
