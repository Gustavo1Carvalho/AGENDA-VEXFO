import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shield, ShieldCheck, Users, Circle, Clock3, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/PageKit";

export const Route = createFileRoute("/_authenticated/tecnicos")({
  component: TecnicosPage,
});

interface Member {
  id: string;
  full_name: string;
  roles: string[];
  is_online?: boolean;
  last_seen_at?: string | null;
  active_orders?: number;
}

function isRecentlyOnline(lastSeen?: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 90_000;
}

function formatLastSeen(lastSeen?: string | null) {
  if (!lastSeen) return "Sem registro";
  return new Date(lastSeen).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TecnicosPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);

  const load = async () => {
    const { data: profs } = await supabase.from("profiles").select("id, full_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const { data: orders } = await supabase
      .from("service_orders")
      .select("technician_id, status")
      .in("status", ["aceito", "em_deslocamento", "em_atendimento"]);

    const { data: presence } = await (supabase.from("user_presence" as never) as any)
      .select("user_id, is_online, last_seen_at");

    const rolesMap: Record<string, string[]> = {};
    (roles ?? []).forEach((r) => {
      rolesMap[r.user_id] = rolesMap[r.user_id] ?? [];
      rolesMap[r.user_id].push(r.role);
    });

    const presenceMap: Record<string, { is_online: boolean; last_seen_at: string | null }> = {};
    (presence ?? []).forEach((p: any) => {
      presenceMap[p.user_id] = { is_online: Boolean(p.is_online), last_seen_at: p.last_seen_at };
    });

    const activeMap: Record<string, number> = {};
    (orders ?? []).forEach((o) => {
      if (!o.technician_id) return;
      activeMap[o.technician_id] = (activeMap[o.technician_id] ?? 0) + 1;
    });

    setMembers((profs ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      roles: rolesMap[p.id] ?? [],
      is_online: Boolean(presenceMap[p.id]?.is_online) && isRecentlyOnline(presenceMap[p.id]?.last_seen_at),
      last_seen_at: presenceMap[p.id]?.last_seen_at ?? null,
      active_orders: activeMap[p.id] ?? 0,
    })));
  };

  useEffect(() => {
    if (role !== "admin") { navigate({ to: "/dashboard" }); return; }
    load();
    const ch = supabase.channel("team-presence")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, load)
      .subscribe();
    const interval = setInterval(load, 30000);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(ch);
    };
  }, [role, navigate]);

  const onlineMembers = useMemo(() => members.filter((m) => m.is_online), [members]);

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    if (isAdmin) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Permissão de admin removida");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) return toast.error(error.message);
      toast.success("Promovido a admin");
    }
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={Users} title="Equipe" subtitle="Gerencie permissões e acompanhe quem está online" />

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Equipe online</h2>
            <p className="text-xs text-muted-foreground">Usuários ativos nos últimos 90 segundos</p>
          </div>
          <Badge className="bg-success/15 text-success border border-success/30">{onlineMembers.length} online</Badge>
        </div>
        {onlineMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum técnico online no momento.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {onlineMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success ring-4 ring-success/15" /><div className="min-w-0">
                <p className="font-medium truncate">{m.full_name || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Activity className="h-3 w-3" /> {m.active_orders ?? 0} OS em andamento
                </p>
              </div></div>
            ))}
          </div>
        )}
      </section>

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <ul className="divide-y divide-border/60">
          {members.map((m) => {
            const isAdmin = m.roles.includes("admin");
            const initials = m.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
            return (
              <li key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:px-5 transition-colors hover:bg-muted/40">
                <Avatar><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials || "U"}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{m.full_name || "Sem nome"}</p>
                    <Badge variant="outline" className={m.is_online ? "border-success/40 text-success" : "border-muted-foreground/30 text-muted-foreground"}>
                      <Circle className={`h-2.5 w-2.5 mr-1 ${m.is_online ? "fill-success" : "fill-muted-foreground"}`} />
                      {m.is_online ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1">
                      {isAdmin ? <><ShieldCheck className="h-3 w-3 text-primary" /> Administrador</> : <><Shield className="h-3 w-3" /> Técnico</>}
                    </span>
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Última atividade: {formatLastSeen(m.last_seen_at)}</span>
                    <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3" /> {m.active_orders ?? 0} OS em andamento</span>
                  </p>
                </div>
                <Button size="sm" variant={isAdmin ? "ghost" : "outline"} onClick={() => toggleAdmin(m.id, isAdmin)}>
                  {isAdmin ? "Remover admin" : "Promover a admin"}
                </Button>
              </li>
            );
          })}
          {members.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">Nenhum membro ainda.</li>}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        💡 Para o status online funcionar, execute o SQL do arquivo <code className="bg-muted px-1 rounded">SQL_USER_PRESENCE.sql</code> no backend.
      </p>
    </div>
  );
}
