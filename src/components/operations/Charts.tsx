/** Gráficos compartilhados por Indicações, Cancelamentos e Trocas de roteador. */
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

/** Mesmas cores usadas nos gráficos da página de Relatórios. */
const CHART_COLORS = ["#2563EB", "#22D3EE", "#8B5CF6", "#84CC16", "#F59E0B", "#EF4444"];

export function ChartCard({
  title,
  children,
  className,
  testId,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-5 shadow-card min-w-0", className)}
      data-testid={testId}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Lista com barras proporcionais (quantidade + complemento opcional). */
export function BarList({
  items,
  empty,
}: {
  items: Array<{ label: string; count: number; extra?: string }>;
  empty: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <p className="text-sm text-muted-foreground py-2">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{it.label}</span>
            <span className="shrink-0 font-semibold">
              {it.count}
              {it.extra ? (
                <span className="ml-2 font-normal text-muted-foreground">{it.extra}</span>
              ) : null}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-primary"
              style={{ width: `${(it.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
};

/** Histórico mensal (12 meses) com uma ou mais séries. */
export function MonthlyChart({
  data,
  series,
}: {
  data: Array<Record<string, string | number>>;
  series: Array<{ key: string; label: string; color?: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" />
        <Tooltip contentStyle={tooltipStyle} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            radius={[6, 6, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
