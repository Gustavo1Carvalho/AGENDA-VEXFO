import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { BarChart3, Briefcase, Download, Filter, Router } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommercialReports } from "@/components/commercial/CommercialReports";
import { RouterSwapReports } from "@/components/operations/RouterSwapReports";
import { PageHeader } from "@/components/app/PageKit";
import { formatDateBR } from "@/lib/date";
import { downloadVexfoReportPdf } from "@/lib/pdf";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import {
  SERVICE_TYPE_LABELS, SERVICE_STATUS_LABELS,
  type ServiceOrder, type ServiceStatus, type ServiceType,
} from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/relatorios")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", data.session.user.id)
      .order("role").limit(1).maybeSingle();
    if (roleRow?.role === "tecnico") throw redirect({ to: "/minhas-ordens" });
  },
  component: RelatoriosPage,
});

interface Tecnico { id: string; full_name: string; }

const CHART_COLORS = ["#2563EB", "#22D3EE", "#8B5CF6", "#84CC16", "#F59E0B", "#EF4444"];

function RelatoriosPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const today = new Date();

  const [day, setDay] = useState<string>("");
  const [month, setMonth] = useState<string>(String(today.getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState<string>(String(today.getFullYear()));
  const [techFilter, setTechFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<ServiceType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | "all">("all");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("service_orders").select("*")
        .order("scheduled_date", { ascending: false });
      setOrders((data ?? []) as ServiceOrder[]);
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "tecnico");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        setTecnicos(((profs ?? []) as Tecnico[]).filter((p) => p.full_name));
      }
    };
    load();
    const ch = supabase.channel("orders-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const techMap = useMemo(() => {
    const m: Record<string, string> = {};
    tecnicos.forEach((t) => { m[t.id] = t.full_name; });
    return m;
  }, [tecnicos]);

  const filtered = useMemo(() => orders.filter((o) => {
    const [y, m, d] = o.scheduled_date.split("-");
    if (year && y !== year) return false;
    if (month && m !== month) return false;
    if (day && d !== day.padStart(2, "0")) return false;
    if (techFilter !== "all" && o.technician_id !== techFilter) return false;
    if (typeFilter !== "all" && o.service_type !== typeFilter) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    return true;
  }), [orders, day, month, year, techFilter, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    const count = (fn: (o: ServiceOrder) => boolean) => filtered.filter(fn).length;
    return {
      total: filtered.length,
      pendente: count((o) => o.status === "pendente"),
      deslocamento: count((o) => o.status === "em_deslocamento"),
      atendimento: count((o) => o.status === "em_atendimento"),
      finalizado: count((o) => o.status === "finalizado"),
      instalacao: count((o) => o.service_type === "instalacao"),
      visita: count((o) => o.service_type === "visita_tecnica"),
      manutencao: count((o) => o.service_type === "manutencao"),
      retirada: count((o) => o.service_type === "retirada_equipamento"),
      troca: count((o) => o.service_type === "troca_roteador"),
    };
  }, [filtered]);

  // Charts data
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((o) => map.set(o.scheduled_date, (map.get(o.scheduled_date) ?? 0) + 1));
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([date, qty]) => ({ name: date.slice(8, 10) + "/" + date.slice(5, 7), qty }));
  }, [filtered]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((o) => {
      const k = o.scheduled_date.slice(0, 7);
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, qty]) => ({ name: `${months[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`, qty }));
  }, [filtered]);

  const byTech = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((o) => {
      const k = o.technician_id ? (techMap[o.technician_id] || "Outro") : "Sem técnico";
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [filtered, techMap]);

  const byType = useMemo(() => Object.entries(SERVICE_TYPE_LABELS).map(([k, label]) => ({
    name: label,
    qty: filtered.filter((o) => o.service_type === k).length,
  })).filter((d) => d.qty > 0), [filtered]);

  const byStatus = useMemo(() => Object.entries(SERVICE_STATUS_LABELS).map(([k, label]) => ({
    name: label,
    qty: filtered.filter((o) => o.status === k).length,
  })).filter((d) => d.qty > 0), [filtered]);

  const [exporting, setExporting] = useState(false);

  const exportPDF = async () => {
    if (exporting) return;
    const period = day ? `Dia ${day.padStart(2, "0")}/${month}/${year}` : `Mês ${month}/${year}`;
    const countStatus = (s: ServiceStatus) => filtered.filter((o) => o.status === s).length;
    setExporting(true);
    try {
      await downloadVexfoReportPdf({
        title: "Relatório de Ordens de Serviço",
        period,
        stats: [
          { label: "Total de OS", value: stats.total },
          { label: "Finalizadas", value: stats.finalizado },
          { label: "Pendentes", value: stats.pendente },
          { label: "Em atendimento", value: stats.atendimento },
          { label: "Em deslocamento", value: stats.deslocamento },
          { label: "Instalações", value: stats.instalacao },
          { label: "Manutenções", value: stats.manutencao },
          { label: "Visitas técnicas", value: stats.visita },
          { label: "Trocas de roteador", value: stats.troca },
          { label: "Retiradas de equipamentos", value: stats.retirada },
        ],
        typeBreakdown: [
          { label: "Instalações", value: stats.instalacao },
          { label: "Manutenções", value: stats.manutencao },
          { label: "Visitas técnicas", value: stats.visita },
          { label: "Trocas de roteador", value: stats.troca },
          { label: "Retiradas de equipamentos", value: stats.retirada },
        ],
        statusBreakdown: [
          { label: "Pendentes", value: stats.pendente },
          { label: "Aceitas", value: countStatus("aceito") },
          { label: "Em deslocamento", value: stats.deslocamento },
          { label: "Em atendimento", value: stats.atendimento },
          { label: "Finalizadas", value: stats.finalizado },
          { label: "Canceladas", value: countStatus("cancelado") },
        ],
        rows: filtered.map((o) => ({
          date: formatDateBR(o.scheduled_date),
          time: (o.scheduled_time ?? "").slice(0, 5),
          client: o.client_name,
          phone: o.client_phone,
          technician: o.technician_id ? techMap[o.technician_id] || "—" : "Sem técnico",
          type: SERVICE_TYPE_LABELS[o.service_type],
          neighborhood: o.neighborhood,
          address: o.address,
          reference: o.reference || "",
          notes: o.notes || "",
          status: SERVICE_STATUS_LABELS[o.status],
        })),
      });
      toast.success("Relatório PDF gerado com sucesso.");
    } catch (err) {
      console.error("[relatorios] Falha ao gerar PDF:", err);
      toast.error("Não foi possível gerar o relatório PDF. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };

  const cards = [
    { label: "Total OS", value: stats.total },
    { label: "Pendentes", value: stats.pendente },
    { label: "Em deslocamento", value: stats.deslocamento },
    { label: "Em atendimento", value: stats.atendimento },
    { label: "Finalizadas", value: stats.finalizado },
    { label: "Instalações", value: stats.instalacao },
    { label: "Visitas técnicas", value: stats.visita },
    { label: "Manutenções", value: stats.manutencao },
    { label: "Retiradas", value: stats.retirada },
    { label: "Trocas roteador", value: stats.troca },
  ];

  return (
    <Tabs defaultValue="os" className="space-y-6">
      <TabsList className="w-full sm:w-auto h-auto flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-card">
        <TabsTrigger value="os" className="flex-1 sm:flex-none"><BarChart3 className="h-4 w-4 mr-1.5" />Ordens de Serviço</TabsTrigger>
        <TabsTrigger value="comercial" className="flex-1 sm:flex-none"><Briefcase className="h-4 w-4 mr-1.5" />Negociações e Upgrades</TabsTrigger>
        <TabsTrigger value="trocas" className="flex-1 sm:flex-none"><Router className="h-4 w-4 mr-1.5" />Trocas de roteador</TabsTrigger>
      </TabsList>
      <TabsContent value="comercial" className="mt-0">
        <CommercialReports />
      </TabsContent>
      <TabsContent value="trocas" className="mt-0">
        <RouterSwapReports />
      </TabsContent>
      <TabsContent value="os" className="mt-0">
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title="Relatórios"
        subtitle="Atendimentos por dia, mês e ano"
        action={
          <Button onClick={exportPDF} disabled={exporting} className="bg-gradient-primary shadow-elegant hover:opacity-95">
            <Download className="h-4 w-4 mr-2" /> {exporting ? "Gerando PDF..." : "Baixar relatório PDF"}
          </Button>
        }
      />

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Filtros</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Dia</Label>
            <Input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} placeholder="Todos" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mês</Label>
            <Select value={month || "all"} onValueChange={(v) => setMonth(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ano</Label>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Técnico</Label>
            <Select value={techFilter} onValueChange={setTechFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {tecnicos.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((k) => (
                  <SelectItem key={k} value={k}>{SERVICE_TYPE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(Object.keys(SERVICE_STATUS_LABELS) as ServiceStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{SERVICE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
            className="rounded-xl border border-border bg-card p-4 shadow-card"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-semibold mt-1.5 tracking-tight">{c.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Atendimentos por dia">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="qty" fill="#2563EB" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Atendimentos por mês">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="qty" fill="#22D3EE" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Atendimentos por técnico">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byTech} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" width={120} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="qty" fill="#8B5CF6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status das OS">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byStatus} dataKey="qty" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => e.qty}>
                {byStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Por tipo de serviço" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byType}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="qty" fill="#84CC16" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Detalhamento</h2>
          <span className="text-sm text-muted-foreground">{filtered.length} OS</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Hora</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Técnico</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Bairro</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.slice(0, 200).map((o) => (
                <tr key={o.id} className="hover:bg-accent/20">
                  <td className="px-4 py-3">{formatDateBR(o.scheduled_date)}</td>
                  <td className="px-4 py-3">{o.scheduled_time.slice(0, 5)}</td>
                  <td className="px-4 py-3 font-medium">{o.client_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.technician_id ? techMap[o.technician_id] || "—" : "—"}</td>
                  <td className="px-4 py-3">{SERVICE_TYPE_LABELS[o.service_type]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.neighborhood}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Nenhum atendimento no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
      </TabsContent>
    </Tabs>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 shadow-card ${className}`}>
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}
