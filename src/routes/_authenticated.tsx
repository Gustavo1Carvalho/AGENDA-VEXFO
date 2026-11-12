import { Link, Outlet, createFileRoute, redirect, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard, CalendarPlus, ListChecks, Wrench, Users, LogOut, Loader2, BarChart3, Handshake, Rocket, UserPlus, UserMinus,
  Menu, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { VexfoLogo } from "@/components/VexfoLogo";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AuthenticatedLayout,
});

type Role = "admin" | "tecnico";
type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { title: string; items: NavItem[] };

/** Mesmas opções (e na mesma ordem) de antes, apenas agrupadas visualmente. */
const ADMIN_NAV: NavGroup[] = [
  { title: "Visão geral", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Operação",
    items: [
      { to: "/agendar", label: "Agendar Serviço", icon: CalendarPlus },
      { to: "/ordens", label: "Ordens de Serviço", icon: ListChecks },
    ],
  },
  {
    title: "Comercial",
    items: [
      { to: "/negociacoes", label: "Negociações", icon: Handshake },
      { to: "/upgrades", label: "Upgrades", icon: Rocket },
      { to: "/indicacoes", label: "Indicações", icon: UserPlus },
      { to: "/cancelamentos", label: "Cancelamentos", icon: UserMinus },
    ],
  },
  {
    title: "Gestão",
    items: [
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { to: "/tecnicos", label: "Técnicos", icon: Users },
    ],
  },
];
const TECH_NAV: NavGroup[] = [
  { title: "Operação", items: [{ to: "/minhas-ordens", label: "Meus Atendimentos", icon: Wrench }] },
];
const ROLE_LABEL: Record<Role, string> = { admin: "Administrador", tecnico: "Técnico" };
const COLLAPSE_KEY = "vexfo:sidebar-collapsed";

function AuthenticatedLayout() {
  const { loading, session, role, fullName, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  // Fecha o menu do celular ao trocar de página.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (loading || !session || !role) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <VexfoLogo size={36} />
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* preferência visual opcional */
      }
      return !c;
    });
  };
  const user = {
    name: fullName || session.user.email || "Usuário",
    initials: (fullName ?? session.user.email ?? "U").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(),
    roleLabel: ROLE_LABEL[role],
  };
  const onSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };
  const groups = role === "admin" ? ADMIN_NAV : TECH_NAV;

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          collapsed ? "w-[72px]" : "w-64",
        )}
        aria-label="Menu principal"
      >
        <SidebarContent
          groups={groups}
          pathname={pathname}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          user={user}
          onSignOut={onSignOut}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Celular / tablet pequeno */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-sm md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" className="-ml-2">
            <Menu className="h-5 w-5" />
          </Button>
          <VexfoLogo size={28} />
          <Avatar className="ml-auto h-8 w-8">
            <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">{user.initials}</AvatarFallback>
          </Avatar>
        </header>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="flex w-72 flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">Navegação da Agenda VEXFO</SheetDescription>
            <SidebarContent groups={groups} pathname={pathname} user={user} onSignOut={onSignOut} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="min-w-0 flex-1 overflow-x-hidden">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  groups,
  pathname,
  collapsed = false,
  onToggle,
  onNavigate,
  user,
  onSignOut,
}: {
  groups: NavGroup[];
  pathname: string;
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  user: { name: string; initials: string; roleLabel: string };
  onSignOut: () => void;
}) {
  return (
    <>
      <div className={cn("flex h-16 shrink-0 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        {collapsed ? <VexfoLogo size={30} tone="dark" showWordmark={false} /> : <VexfoLogo size={30} tone="dark" />}
        {onToggle && !collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Recolher menu"
            title="Recolher menu"
            className="rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-white"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.title}>
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-8 bg-sidebar-border" />
            ) : (
              <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">{g.title}</p>
            )}
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const active = pathname === it.to || pathname.startsWith(`${it.to}/`);
                return (
                  <Link
                    key={it.to}
                    to={it.to}
                    onClick={onNavigate}
                    title={collapsed ? it.label : undefined}
                    aria-label={collapsed ? it.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg py-2 text-[13.5px] font-medium transition-colors",
                      collapsed ? "justify-center px-2" : "px-3",
                      active
                        ? "bg-sidebar-accent text-white"
                        : "text-sidebar-foreground hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-primary" />}
                    <it.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-sky-300" : "text-sidebar-foreground/80 group-hover:text-white")} />
                    {!collapsed && <span className="truncate">{it.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {onToggle && collapsed && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expandir menu"
          title="Expandir menu"
          className="mx-auto mb-2 rounded-md p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-white"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-3 rounded-lg p-2", collapsed && "flex-col gap-2 p-1")}>
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-sidebar-primary text-xs font-semibold text-white">{user.initials}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-sidebar-foreground/70">{user.roleLabel}</p>
            </div>
          )}
          <button
            type="button"
            onClick={onSignOut}
            title="Sair"
            aria-label="Sair"
            className="rounded-md p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
