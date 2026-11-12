/** Date helpers that never reinterpret a PostgreSQL DATE as UTC. */
export function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateBR(dateValue: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!dateValue) return "—";
  const [year, month, day] = dateValue.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return dateValue;
  return new Intl.DateTimeFormat("pt-BR", options).format(new Date(year, month - 1, day));
}

export function formatDateLongBR(dateValue: string | null | undefined) {
  return formatDateBR(dateValue, { dateStyle: "long" });
}
