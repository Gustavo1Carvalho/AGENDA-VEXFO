import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { IndicacoesPage } from "@/components/operations/IndicacoesPage";

export const Route = createFileRoute("/_authenticated/indicacoes")({
  // Mesmo controle de acesso das telas administrativas: técnicos vão para "Meus Atendimentos".
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.session.user.id)
      .order("role")
      .limit(1)
      .maybeSingle();
    if (roleRow?.role === "tecnico") throw redirect({ to: "/minhas-ordens" });
  },
  component: IndicacoesPage,
});
