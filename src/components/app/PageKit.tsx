/**
 * Kit visual compartilhado da Agenda VEXFO (padrão SaaS).
 * Cabeçalhos de página, cards de indicadores, seções, estados vazios,
 * carregamentos e confirmações usados por todos os módulos.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Inbox } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string }>;
export type Tone = "primary" | "destructive" | "warning" | "success" | "neutral";

const TONES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary ring-primary/15",
  destructive: "bg-destructive/10 text-destructive ring-destructive/15",
  warning: "bg-warning/10 text-warning ring-warning/20",
  success: "bg-success/10 text-success ring-success/15",
  neutral: "bg-muted text-muted-foreground ring-border",
};

/** Ícone em "pastilha" suave, usado em cabeçalhos e cards. */
export function IconTile({
  icon: Icon,
  tone = "primary",
  className,
}: {
  icon: IconType;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

export function PageHeader({
  icon,
  title,
  subtitle,
  eyebrow,
  action,
}: {
  icon: IconType;
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3.5">
        <IconTile icon={icon} className="h-11 w-11 rounded-xl" />
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{action}</div>}
    </header>
  );
}

/** Card de indicador. Clicável quando recebe onClick (ex.: aplicar filtro). */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  active,
  onClick,
  index = 0,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: IconType;
  tone?: Exclude<Tone, "neutral">;
  active?: boolean;
  onClick?: () => void;
  index?: number;
  loading?: boolean;
}) {
  const anim = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.18, delay: Math.min(index * 0.03, 0.2) },
  };
  const cls = cn(
    "group flex w-full min-w-0 flex-col justify-start rounded-xl border border-border bg-card p-4 text-left shadow-card transition-all sm:p-5",
    onClick &&
      "cursor-pointer hover:border-primary/40 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active && "border-primary ring-2 ring-primary/20",
  );
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <IconTile icon={icon} tone={tone} className="h-8 w-8" />
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded-md bg-muted" />
      ) : (
        <div className="text-2xl mt-1.5 truncate font-semibold tracking-tight text-foreground">
          {value}
        </div>
      )}
      {hint && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  return onClick ? (
    <motion.button type="button" onClick={onClick} aria-pressed={active} {...anim} className={cls}>
      {inner}
    </motion.button>
  ) : (
    <motion.div {...anim} className={cls}>
      {inner}
    </motion.div>
  );
}

/** Seção em card com cabeçalho opcional (título, descrição e ações). */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  testId,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  testId?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-card",
        className,
      )}
      data-testid={testId}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({
  children,
  icon: Icon = Inbox,
  className,
}: {
  children: ReactNode;
  icon?: IconType;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <div className="max-w-sm text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

/** Esqueletos de carregamento. */
export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}
      aria-busy="true"
      aria-label="Carregando"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-7 w-14 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn(
        "divide-y divide-border rounded-xl border border-border bg-card shadow-card",
        className,
      )}
      aria-busy="true"
      aria-label="Carregando"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Campo de formulário com rótulo, dica e erro. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[13px] font-medium text-foreground/90">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="h-3.5 w-1 rounded-full bg-primary" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Excluir",
  busy,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? "Excluindo..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
