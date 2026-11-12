import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Router } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RouterSwapDialog } from "@/components/operations/RouterSwapDialog";
import { operationsApi } from "@/lib/operations-api";
import { routerSwapDate, routerSwapReasonText, type RouterSwap } from "@/lib/operations";
import type { ServiceOrder } from "@/lib/orders";
import { formatDateBR } from "@/lib/date";

/**
 * Visualização administrativa do motivo da troca do roteador dentro da OS.
 * Exibida apenas para OS de troca de roteador. Se a tabela ainda não existir
 * no banco (migration não aplicada), o painel não é exibido.
 */
export function RouterSwapPanel({
  order,
  technicianName,
}: {
  order: ServiceOrder;
  technicianName: string | null;
}) {
  const [swap, setSwap] = useState<RouterSwap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setSwap(await operationsApi.getRouterSwap(order.id));
      setState("ready");
    } catch {
      setState("unavailable");
    }
  }, [order.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "unavailable") return null;

  const rows: Array<[string, string]> = [
    ["Cliente", order.client_name],
    ["Número do contrato", swap?.contract_number || "Não informado"],
    ["Técnico responsável", technicianName ?? "—"],
    ["Data da troca", formatDateBR(routerSwapDate({ order, swap }))],
    ["Motivo da troca", routerSwapReasonText(swap)],
    ["Observações", swap?.notes || "—"],
  ];

  return (
    <div
      className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3"
      data-testid="router-swap-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Router className="h-4 w-4 text-primary" />
          Troca de roteador
        </p>
        {state === "ready" && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            {swap ? "Editar" : "Registrar"}
          </Button>
        )}
      </div>
      {state === "loading" ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : (
        <>
          {!swap && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              Motivo da troca ainda não registrado pelo técnico.
            </p>
          )}
          <dl className="space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <RouterSwapDialog
        open={editing}
        orderId={order.id}
        clientName={order.client_name}
        existing={swap}
        mode="edit"
        onOpenChange={setEditing}
        onSaved={load}
      />
    </div>
  );
}
