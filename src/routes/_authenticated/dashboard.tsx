import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar, CheckCircle2, Clock, Wrench, Activity, TrendingUp, Plus, MapPin, Award, LayoutDashboard, ArrowRight, CalendarX2, Inbox,
} from "lucide-react";
import { EmptyState, IconTile, ListSkeleton, PageHeader, SectionCard, StatCard } from "@/components/app/PageKit";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/StatusBadge";
import { SERVICE_TYPE_LABELS, type ServiceOrder } from "@/lib/orders";
import { formatDateBR, getLocalDateInputValue } from "@/lib/date";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", data.session.user.id)
      .order("role").limit(1).maybeSingle();
    if (roleRow?.role === "tecnico") throw redirect({ to: "/minhas-ordens" });
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { fullName } = useAuth();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [techMap, setTechMap] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from("service_orders").select("*")
      .order("scheduled_date", { ascending: false })
      .order("scheduled_time", { ascending: false })
      .limit(500);
    const list = (data ?? []) as ServiceOrder[];
    setOrders(list);

    const ids = Array.from(new Set(list.map((o) => o.technician_id).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const m: Record<string, string> = {};
      (profs ?? []).forEach((p) => { m[p.id] = p.full_name; });
      setTechMap(m);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("orders-dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const today = getLocalDateInputValue();
  const currentMonth = today.slice(0, 7);
  const todayOrders = orders.filter((o) => o.scheduled_date === today);
  const monthOrders = useMemo(() => orders.filter((o) => o.scheduled_date.startsWith(currentMonth)), [orders, currentMonth]);
  const installs = orders.filter((o) => o.service_type === "instalacao").length;
  const visits = orders.filter((o) => o.service_type === "visita_tecnica").length;
  const done = orders.filter((o) => o.status === "finalizado").length;
  const monthDone = monthOrders.filter((o) => o.status === "finalizado").length;
  const pending = orders.filter((o) => o.status === "pendente").length;
  const inProgress = orders.filter((o) =>
    o.status === "em_atendimento" || o.status === "em_deslocamento" || o.status === "aceito"
  ).length;

  const topTech = useMemo(() => {
    const counts = new Map<string, number>();
    monthOrders.forEach((o) => {
      if (o.technician_id) counts.set(o.technician_id, (counts.get(o.technician_id) ?? 0) + 1);
    });
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    return { name: techMap[top[0]] ?? "Técnico", count: top[1] };
  }, [monthOrders, techMap]);

  const topNeighborhood = useMemo(() => {
    const counts = new Map<string, number>();
    monthOrders.forEach((o) => {
      if (o.neighborhood) counts.set(o.neighborhood, (counts.get(o.neighborhood) ?? 0) + 1);
    });
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return top ? { name: top[0], count: top[1] } : null;
  }, [monthOrders]);

  const stats = [
    { label: "Serviços hoje", value: todayOrders.length, icon: Calendar, tone: "primary" as const },
    { label: "Em andamento", value: inProgress, icon: Activity, tone: "primary" as const },
    { label: "Pendentes", value: pending, icon: Clock, tone: "warning" as const },
    { label: "OS no mês", value: monthOrders.length, icon: TrendingUp, tone: "primary" as const },
    { label: "Finalizadas no mês", value: monthDone, icon: CheckCircle2, tone: "success" as const },
    { label: "Total finalizadas", value: done, icon: Wrench, tone: "success" as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        eyebrow={`Olá, ${fullName?.split(" ")[0] || "Admin"}`}
        title="Dashboard"
        subtitle="Visão geral dos atendimentos"
        action={
          <Button asChild className="bg-gradient-primary shadow-elegant hover:opacity-95">
            <Link to="/agendar"><Plus className="h-4 w-4 mr-2" />Agendar serviço</Link>
          </Button>
        }
      />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s, i) => (
          <StatCard key={s.label} index={i} label={s.label} value={s.value} icon={s.icon} tone={s.tone} loading={loading} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HighlightCard icon={Award} title="Técnico destaque do mês" value={topTech?.name ?? "—"} hint={topTech ? `${topTech.count} atendimentos` : "Sem dados"} />
        <HighlightCard icon={MapPin} title="Bairro com mais chamados" value={topNeighborhood?.name ?? "—"} hint={topNeighborhood ? `${topNeighborhood.count} chamados no mês` : "Sem dados"} />
        <HighlightCard icon={TrendingUp} title="Instalações (total)" value={String(installs)} hint="Acumulado" />
        <HighlightCard icon={Wrench} title="Visitas técnicas (total)" value={String(visits)} hint="Acumulado" />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <SectionCard
          className="xl:col-span-3"
          title="Agenda de hoje"
          action={<span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{todayOrders.length} serviços</span>}
        >
          {loading ? (
            <ListSkeleton rows={3} className="rounded-none border-0 shadow-none" />
          ) : todayOrders.length === 0 ? (
            <EmptyState icon={CalendarX2} className="m-4 border-0 bg-muted/40">Nenhum serviço agendado para hoje.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {todayOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50">
                  <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                    <span className="text-sm font-semibold tabular-nums">{o.scheduled_time.slice(0, 5)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{o.client_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {SERVICE_TYPE_LABELS[o.service_type]} • {o.neighborhood}{!o.technician_id ? " • Aguardando técnico" : ""}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          title="Atendimentos recentes"
          action={
            <Link to="/ordens" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loading ? (
            <ListSkeleton rows={4} className="rounded-none border-0 shadow-none" />
          ) : (
            <ul className="divide-y divide-border">
              {orders.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{o.client_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatDateBR(o.scheduled_date)} às {o.scheduled_time.slice(0,5)} • {SERVICE_TYPE_LABELS[o.service_type]}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </li>
              ))}
              {orders.length === 0 && (
                <li><EmptyState icon={Inbox} className="m-4 border-0 bg-muted/40">Nenhuma ordem ainda.</EmptyState></li>
              )}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function HighlightCard({ icon, title, value, hint }: { icon: React.ComponentType<{ className?: string }>; title: string; value: string; hint: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card">
      <IconTile icon={icon} className="h-11 w-11 rounded-xl" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
        <p className="mt-0.5 text-lg font-semibold truncate">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
