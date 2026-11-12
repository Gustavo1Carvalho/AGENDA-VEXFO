import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Router } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/commercial/CommercialUi";
import { operationsApi } from "@/lib/operations-api";
import { friendlyDbError } from "@/lib/commercial";
import {
  ROUTER_SWAP_REASONS,
  ROUTER_SWAP_REASON_LABELS,
  validateRouterSwap,
  type RouterSwap,
} from "@/lib/operations";

type Props = {
  open: boolean;
  orderId: string | null;
  clientName?: string;
  existing: RouterSwap | null;
  /** "finalize": técnico registrando antes de finalizar a OS. "edit": consulta/correção. */
  mode: "finalize" | "edit";
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de salvar o motivo (no modo "finalize", o chamador finaliza a OS). */
  onSaved: () => void | Promise<void>;
};

/** Formulário do motivo da troca do roteador (seletor obrigatório + "Outro motivo" + observações). */
export function RouterSwapDialog({
  open,
  orderId,
  clientName,
  existing,
  mode,
  onOpenChange,
  onSaved,
}: Props) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [notes, setNotes] = useState("");
  const [contract, setContract] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(existing?.reason ?? "");
    setOther(existing?.reason_other ?? "");
    setNotes(existing?.notes ?? "");
    setContract(existing?.contract_number ?? "");
  }, [open, existing]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!orderId) return;
    const error = validateRouterSwap({ reason, reason_other: other });
    if (error) return toast.error(error);
    setSaving(true);
    try {
      await operationsApi.saveRouterSwap(
        orderId,
        { reason, reason_other: other, notes, contract_number: contract },
        existing,
      );
      if (mode === "edit") toast.success("Motivo da troca salvo.");
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyDbError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-1 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Router className="h-5 w-5 text-primary" />
            Motivo da troca do roteador
          </DialogTitle>
          <DialogDescription>
            {clientName ? `${clientName}. ` : ""}
            {mode === "finalize"
              ? "Obrigatório para finalizar a ordem de serviço de troca."
              : "Registro permanente na ordem de serviço."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" aria-label="Formulário do motivo da troca">
          <Field label="Motivo da troca do roteador *">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Motivo da troca do roteador">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {ROUTER_SWAP_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROUTER_SWAP_REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {reason === "outro" && (
            <Field label="Explique o motivo *">
              <Textarea
                required
                rows={2}
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="Descreva a situação"
                aria-label="Explique o motivo"
              />
            </Field>
          )}
          <Field label="Observações complementares">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-label="Observações complementares"
            />
          </Field>
          <Field label="Número do contrato" hint="Opcional">
            <Input
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              aria-label="Número do contrato"
            />
          </Field>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className={
                mode === "finalize"
                  ? "bg-success text-success-foreground hover:bg-success/90"
                  : "bg-gradient-primary"
              }
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "finalize" ? "Salvar motivo e finalizar" : "Salvar motivo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
