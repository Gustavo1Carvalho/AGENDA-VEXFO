import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/orders";
import { getLocalDateInputValue } from "@/lib/date";
import { PageHeader } from "@/components/app/PageKit";

export const Route = createFileRoute("/_authenticated/agendar")({
  component: AgendarPage,
});

interface Tecnico { id: string; full_name: string; }

function AgendarPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    client_name: "", client_phone: "", address: "", neighborhood: "", city: "", state: "", reference: "",
    service_type: "instalacao" as ServiceType,
    scheduled_date: getLocalDateInputValue(),
    scheduled_time: "09:00",
    technician_id: "",
    notes: "",
  });

  useEffect(() => {
    if (role !== "admin") {
      toast.error("Apenas administradores podem agendar serviços");
      navigate({ to: "/dashboard" });
      return;
    }
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "tecnico");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return;
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      setTecnicos(((profs ?? []) as Tecnico[]).filter((p) => p.full_name));
    })();
  }, [role, navigate]);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        ...form,
        technician_id: form.technician_id || null,
        reference: form.reference || null,
        city: form.city || null,
        state: form.state || null,
        notes: form.notes || null,
        created_by: user?.id ?? null,
      };
      const { error } = await supabase.from("service_orders").insert(payload);
      if (error) throw error;
      toast.success("Serviço agendado com sucesso!");
      navigate({ to: "/ordens" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao agendar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader icon={CalendarPlus} title="Agendar serviço" subtitle="Crie uma nova OS para todos os técnicos ou atribua a um técnico específico" />

      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="rounded-xl border border-border bg-card p-5 sm:p-8 shadow-card space-y-8"
      >
        <Section title="Cliente">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nome do cliente *">
              <Input required value={form.client_name} onChange={(e) => update("client_name", e.target.value)} />
            </Field>
            <Field label="Telefone *">
              <Input required value={form.client_phone} onChange={(e) => update("client_phone", e.target.value)} placeholder="(98) 99999-9999" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field label="Endereço *">
                <Input required value={form.address} onChange={(e) => update("address", e.target.value)} />
              </Field>
            </div>
            <Field label="Bairro *">
              <Input required value={form.neighborhood} onChange={(e) => update("neighborhood", e.target.value)} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field label="Cidade">
                <Input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Ex.: São Luís" />
              </Field>
            </div>
            <Field label="Estado">
              <Input value={form.state} onChange={(e) => update("state", e.target.value.toUpperCase().slice(0, 2))} placeholder="MA" maxLength={2} />
            </Field>
          </div>
          <Field label="Ponto de referência">
            <Input value={form.reference} onChange={(e) => update("reference", e.target.value)} placeholder="Próximo a..." />
          </Field>
        </Section>

        <Section title="Serviço">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Tipo de serviço *">
              <Select value={form.service_type} onValueChange={(v) => update("service_type", v as ServiceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((k) => (
                    <SelectItem key={k} value={k}>{SERVICE_TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Técnico responsável">
              <Select value={form.technician_id || "unassigned"} onValueChange={(v) => update("technician_id", v === "unassigned" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Disponível para todos os técnicos</SelectItem>
                  {tecnicos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Data *">
              <Input type="date" required value={form.scheduled_date} onChange={(e) => update("scheduled_date", e.target.value)} />
            </Field>
            <Field label="Horário *">
              <Input type="time" required value={form.scheduled_time} onChange={(e) => update("scheduled_time", e.target.value)} />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Informações adicionais para o técnico..." />
          </Field>
        </Section>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/ordens" })}>Cancelar</Button>
          <Button type="submit" disabled={submitting} className="bg-gradient-primary shadow-elegant hover:opacity-95 min-w-40">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Agendar Serviço"}
          </Button>
        </div>
      </motion.form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span className="h-3.5 w-1 rounded-full bg-primary" />{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-medium text-foreground/90">{label}</Label>
      {children}
    </div>
  );
}
