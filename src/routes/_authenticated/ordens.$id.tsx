import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Phone, User, Calendar, Clock, Wrench, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  SERVICE_TYPE_LABELS, buildFullAddress, hasMappableAddress,
  googleMapsDirectionsUrl, googleMapsEmbedUrl, formatPhone,
  type ServiceOrder,
} from "@/lib/orders";
import { formatDateLongBR } from "@/lib/date";
import { RouterSwapPanel } from "@/components/operations/RouterSwapPanel";
import { requiresRouterSwapReason } from "@/lib/operations";
import { EmptyState, SectionCard } from "@/components/app/PageKit";

export const Route = createFileRoute("/_authenticated/ordens/$id")({
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [technicianName, setTechnicianName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("service_orders").select("*").eq("id", id).maybeSingle();
      const o = data as ServiceOrder | null;
      setOrder(o);
      if (o?.technician_id) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", o.technician_id).maybeSingle();
        setTechnicianName(p?.full_name ?? null);
      }
      setLoading(false);
    })();

    const ch = supabase.channel(`order-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_orders", filter: `id=eq.${id}` },
        (payload) => setOrder(payload.new as ServiceOrder))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Carregando">
        <div className="h-16 animate-pulse rounded-xl bg-card shadow-card" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="h-80 animate-pulse rounded-xl bg-card shadow-card" />
          <div className="lg:col-span-2 h-80 animate-pulse rounded-xl bg-card shadow-card" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <EmptyState icon={AlertTriangle}>
        <p>Ordem de serviço não encontrada.</p>
        <Button asChild className="mt-4"><Link to="/ordens">Voltar</Link></Button>
      </EmptyState>
    );
  }

  const fullAddress = buildFullAddress(order);
  const canMap = hasMappableAddress(order);
  const formatStamp = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  // Histórico montado apenas com as datas já registradas na própria OS.
  const history: Array<{ label: string; at: string | null; done: boolean }> = [
    { label: "OS criada", at: order.created_at, done: true },
    { label: "Atendimento iniciado", at: order.started_at, done: Boolean(order.started_at) },
    { label: order.status === "cancelado" ? "Cancelada" : "Finalizada", at: order.completed_at, done: Boolean(order.completed_at) || order.status === "cancelado" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <header className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="icon" onClick={() => navigate({ to: "/ordens" })} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ordem de Serviço</p>
            <h1 className="text-xl font-semibold tracking-tight truncate sm:text-2xl">{order.client_name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{SERVICE_TYPE_LABELS[order.service_type]}</span>
          <StatusBadge status={order.status} />
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Informações */}
        <div className="lg:col-span-1 space-y-4">
          <SectionCard title="Informações">
            <dl className="divide-y divide-border">
              <InfoCard icon={Wrench} label="Tipo de serviço" value={SERVICE_TYPE_LABELS[order.service_type]} />
              <InfoCard icon={Calendar} label="Data agendada" value={formatDateLongBR(order.scheduled_date)} />
              <InfoCard icon={Clock} label="Horário" value={order.scheduled_time.slice(0, 5)} />
              <InfoCard icon={Phone} label="Telefone" value={formatPhone(order.client_phone)} />
              {technicianName && <InfoCard icon={User} label="Técnico" value={technicianName} />}
            </dl>
          </SectionCard>
          {requiresRouterSwapReason(order) && <RouterSwapPanel order={order} technicianName={technicianName} />}
          {order.notes && (
            <SectionCard title="Observações" bodyClassName="p-5">
              <p className="text-sm italic text-foreground/90">"{order.notes}"</p>
            </SectionCard>
          )}
          <SectionCard title="Histórico da ordem" bodyClassName="p-5">
            <ol className="relative space-y-4 border-l border-border pl-5">
              {history.map((h) => (
                <li key={h.label} className="relative">
                  <span className={`absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card ${h.done ? "bg-primary" : "bg-border"}`} />
                  <p className={`text-sm font-medium ${h.done ? "text-foreground" : "text-muted-foreground"}`}>{h.label}</p>
                  <p className="text-xs text-muted-foreground">{h.at ? formatStamp(h.at) : "—"}</p>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>

        {/* Mapa */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-card">
            <div className="p-5 border-b border-border">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Localização</p>
                  <p className="font-semibold flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{fullAddress || "Endereço não informado"}</span>
                  </p>
                  {order.reference && (
                    <p className="text-xs text-muted-foreground mt-1 ml-6">Ref.: {order.reference}</p>
                  )}
                </div>
                {canMap && (
                  <Button asChild className="bg-gradient-primary shadow-elegant hover:opacity-95 shrink-0">
                    <a href={googleMapsDirectionsUrl(fullAddress)} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir rota
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {canMap ? (
              <iframe
                title={`Mapa - ${order.client_name}`}
                src={googleMapsEmbedUrl(fullAddress)}
                width="100%"
                height="420"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block border-0"
              />
            ) : (
              <div className="p-10 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-warning mb-3" />
                <p className="text-sm font-medium">Endereço incompleto para exibir no mapa.</p>
                <p className="text-xs text-muted-foreground mt-1">Informe pelo menos endereço, bairro e cidade ou estado.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium truncate">{value}</dd>
      </div>
    </div>
  );
}
