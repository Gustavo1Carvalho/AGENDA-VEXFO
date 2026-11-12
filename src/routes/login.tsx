import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VexfoLogo } from "@/components/VexfoLogo";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Agenda VEXFO FIBRA" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/dashboard" />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName, phone },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Você já pode acessar.");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao autenticar";
      toast.error(msg.includes("Invalid login") ? "Email ou senha inválidos" : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="relative grid min-h-screen lg:grid-cols-2">
        {/* Left visual panel */}
        <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-sidebar p-12 text-white">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
          <VexfoLogo size={40} tone="dark" className="relative" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative space-y-6"
          >
            <h2 className="text-4xl font-semibold leading-tight tracking-tight">
              Gerencie atendimentos<br/>técnicos em <span className="text-sky-300">tempo real</span>.
            </h2>
            <p className="text-lg text-sidebar-foreground max-w-md">
              Plataforma SaaS premium para provedores de internet. Agende, distribua e acompanhe sua equipe técnica de qualquer lugar.
            </p>
            <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Conexão segura e criptografada
            </div>
          </motion.div>

          <p className="relative text-xs text-sidebar-foreground/70">© {new Date().getFullYear()} VEXFO FIBRA. Todos os direitos reservados.</p>
        </div>

        {/* Right form panel */}
        <div className="flex items-center justify-center p-6 sm:p-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md"
          >
            <div className="lg:hidden mb-8">
              <VexfoLogo size={44} />
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-glow sm:p-8">
              <h2 className="text-2xl font-semibold tracking-tight mb-1">Acesse sua conta</h2>
              <p className="text-sm text-muted-foreground mb-6">Administradores e técnicos</p>

              <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")} className="mb-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Criar conta</TabsTrigger>
                </TabsList>
                <TabsContent value="signin" />
                <TabsContent value="signup" />
              </Tabs>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome completo</Label>
                      <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João da Silva" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(98) 99999-9999" />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@vexfo.com.br" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>

                <Button type="submit" disabled={submitting} className="h-10 w-full bg-gradient-primary shadow-elegant hover:opacity-95">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Entrar" : "Criar conta"}
                </Button>
              </form>

              {mode === "signup" && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Novas contas são criadas como <strong className="text-foreground">técnico</strong>. Um administrador pode promover seu acesso.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
