/** Componentes visuais dos módulos comerciais. Os genéricos vêm do kit compartilhado (PageKit). */
export {
  ConfirmDialog,
  EmptyState,
  Field,
  FormSection,
  PageHeader,
  StatCard as IndicatorCard,
} from "@/components/app/PageKit";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Search, UserCheck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Field } from "@/components/app/PageKit";
import {
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_STATUS_STYLES,
  clientMatchesSearch,
  formatCpf,
  isValidCpf,
  onlyDigits,
  type Client,
  type ContactState,
  type NegotiationStatus,
} from "@/lib/commercial";
import type { ClientInput } from "@/lib/commercial-api";
import { clientToInput, cpfError, emptyClientInput } from "@/lib/commercial-form";
import { formatDateBR } from "@/lib/date";

export function NegotiationStatusBadge({
  status,
  className,
}: {
  status: NegotiationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        NEGOTIATION_STATUS_STYLES[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {NEGOTIATION_STATUS_LABELS[status]}
    </span>
  );
}

export function NextContactBadge({ date, state }: { date: string | null; state: ContactState }) {
  if (!date) return <span className="text-xs text-muted-foreground">—</span>;
  const label = formatDateBR(date);
  if (state === "atrasado")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive whitespace-nowrap">
        <AlertTriangle className="h-3 w-3" /> {label} · atrasado
      </span>
    );
  if (state === "hoje")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning whitespace-nowrap">
        {label} · hoje
      </span>
    );
  return (
    <span
      className={cn("text-xs whitespace-nowrap", state === "encerrado" && "text-muted-foreground")}
    >
      {label}
    </span>
  );
}

/**
 * Dados do cliente com busca de cadastro existente (evita duplicidade):
 * - pesquisar e selecionar um cliente já cadastrado;
 * - ao informar número do contrato ou CPF já existentes, os dados são carregados automaticamente.
 */
export function ClientFields({
  value,
  onChange,
  clients,
  selectedId,
  onSelect,
  requirePhone,
  showAddress = true,
  contractOnly = false,
  nameLabel = "Nome do cliente *",
  contractLabel = "Número do contrato",
}: {
  value: ClientInput;
  onChange: (v: ClientInput) => void;
  clients: Client[];
  selectedId: string | null;
  onSelect: (client: Client | null) => void;
  requirePhone?: boolean;
  showAddress?: boolean;
  /** Exibe só nome e número do contrato (CPF, telefone e endereço do cadastro são preservados). */
  contractOnly?: boolean;
  nameLabel?: string;
  contractLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) =>
    onChange({ ...value, [k]: v });
  const results = useMemo(
    () =>
      query.trim().length >= 2
        ? clients.filter((c) => clientMatchesSearch(c, query)).slice(0, 6)
        : [],
    [clients, query],
  );
  const selected = selectedId ? (clients.find((c) => c.id === selectedId) ?? null) : null;

  const pick = (c: Client) => {
    onSelect(c);
    onChange(clientToInput(c));
    setQuery("");
  };

  /** Ao sair do campo número do contrato/CPF, reaproveita o cadastro se já existir. */
  const autoMatch = (field: "client_code" | "cpf") => {
    const v = value[field].trim();
    if (!v) return;
    const match = clients.find((c) =>
      field === "client_code"
        ? (c.client_code ?? "").trim().toLowerCase() === v.toLowerCase()
        : c.cpf && c.cpf === onlyDigits(v),
    );
    if (match && match.id !== selectedId) pick(match);
  };

  return (
    <div className="space-y-4">
      {selected ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
          <span className="flex items-start gap-2 min-w-0">
            <UserCheck className="h-4 w-4 mt-0.5 shrink-0 text-success" />
            <span className="min-w-0 break-words">
              Cliente já cadastrado: <strong>{selected.name}</strong>
              {selected.client_code ? ` · contrato ${selected.client_code}` : ""}. As alterações
              abaixo atualizam o cadastro.
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              onSelect(null);
              onChange(emptyClientInput());
            }}
            title="Usar outro cliente"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cliente já cadastrado? Pesquise por nome, nº do contrato, telefone ou CPF"
            className="pl-9"
            aria-label="Pesquisar cliente cadastrado"
          />
          {results.length > 0 && (
            <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-elegant">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {[c.client_code && `contrato ${c.client_code}`, c.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && results.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Nenhum cadastro encontrado — preencha abaixo para
              cadastrar um novo cliente.
            </p>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <Field label={contractLabel} hint="Evita cadastro duplicado">
          <Input
            value={value.client_code}
            onChange={(e) => set("client_code", e.target.value)}
            onBlur={() => autoMatch("client_code")}
            placeholder="Ex.: 10234"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label={nameLabel}>
            <Input required value={value.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
        </div>
      </div>
      {!contractOnly && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="CPF" hint="Opcional" error={cpfError(value.cpf)}>
            <Input
              value={value.cpf}
              inputMode="numeric"
              onChange={(e) => set("cpf", e.target.value)}
              onBlur={() => {
                if (isValidCpf(value.cpf)) set("cpf", formatCpf(value.cpf));
                autoMatch("cpf");
              }}
              placeholder="000.000.000-00"
            />
          </Field>
          <Field label={requirePhone ? "Telefone / WhatsApp *" : "Telefone"}>
            <Input
              required={requirePhone}
              value={value.phone}
              inputMode="tel"
              onChange={(e) => set("phone", e.target.value)}
              placeholder="(98) 99999-9999"
            />
          </Field>
        </div>
      )}
      {showAddress && !contractOnly && (
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <Field label="Endereço">
              <Input value={value.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
          <Field label="Bairro">
            <Input
              value={value.neighborhood}
              onChange={(e) => set("neighborhood", e.target.value)}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
