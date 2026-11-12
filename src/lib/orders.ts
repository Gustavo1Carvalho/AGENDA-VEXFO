import type { Database } from "@/integrations/supabase/types";

export type ServiceOrder = Database["public"]["Tables"]["service_orders"]["Row"];
export type ServiceType = Database["public"]["Enums"]["service_type"];
export type ServiceStatus = Database["public"]["Enums"]["service_status"];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  instalacao: "Instalação",
  visita_tecnica: "Visita Técnica",
  manutencao: "Manutenção",
  retirada_equipamento: "Retirada de Equipamento",
  troca_roteador: "Troca de Roteador",
};

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  pendente: "Pendente",
  aceito: "Aceito",
  em_deslocamento: "Em deslocamento",
  em_atendimento: "Em atendimento",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export const STATUS_COLORS: Record<ServiceStatus, string> = {
  pendente: "bg-amber-50 text-amber-700 border-amber-200",
  aceito: "bg-indigo-50 text-indigo-700 border-indigo-200",
  em_deslocamento: "bg-blue-50 text-blue-700 border-blue-200",
  em_atendimento: "bg-sky-50 text-sky-700 border-sky-200",
  finalizado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelado: "bg-red-50 text-red-700 border-red-200",
};

/** Cor de destaque (faixa lateral) por status — apenas visual. */
export const STATUS_ACCENT: Record<ServiceStatus, string> = {
  pendente: "bg-amber-400",
  aceito: "bg-indigo-500",
  em_deslocamento: "bg-blue-500",
  em_atendimento: "bg-sky-500",
  finalizado: "bg-emerald-500",
  cancelado: "bg-red-400",
};

export function formatPhone(p: string | null | undefined) {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
}

/** Monta endereço completo a partir dos campos da OS. */
export function buildFullAddress(o: Pick<ServiceOrder, "address" | "neighborhood" | "city" | "state" | "reference">) {
  const parts = [o.address, o.neighborhood, o.city, o.state].filter(Boolean) as string[];
  return parts.join(", ");
}

/** Considera endereço válido para mapa quando tem ao menos endereço + bairro + (cidade ou estado). */
export function hasMappableAddress(o: Pick<ServiceOrder, "address" | "neighborhood" | "city" | "state">) {
  return Boolean(o.address && o.neighborhood && (o.city || o.state));
}

export function googleMapsDirectionsUrl(addr: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
}

export function googleMapsEmbedUrl(addr: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(addr)}&hl=pt-BR&z=16&output=embed`;
}
