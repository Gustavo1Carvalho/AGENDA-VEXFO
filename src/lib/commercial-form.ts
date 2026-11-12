/** Auxiliares dos formulários comerciais (dados do cliente). */
import { formatCpf, isValidCpf, onlyDigits, type Client } from "@/lib/commercial";
import type { ClientInput } from "@/lib/commercial-api";

/** Valor usado nos selects para "sem responsável" (o Radix Select não aceita valor vazio). */
export const NO_RESPONSIBLE = "none";

export const emptyClientInput = (): ClientInput => ({
  name: "",
  client_code: "",
  cpf: "",
  phone: "",
  address: "",
  neighborhood: "",
});

export const clientToInput = (c: Client | null | undefined): ClientInput => ({
  name: c?.name ?? "",
  client_code: c?.client_code ?? "",
  cpf: c?.cpf ? formatCpf(c.cpf) : "",
  phone: c?.phone ?? "",
  address: c?.address ?? "",
  neighborhood: c?.neighborhood ?? "",
});

/** Erro de validação do CPF (opcional, mas se informado precisa ser válido). */
export const cpfError = (cpf: string) =>
  onlyDigits(cpf) && !isValidCpf(cpf) ? "CPF inválido." : null;
