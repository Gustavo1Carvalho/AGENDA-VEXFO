import { SERVICE_STATUS_LABELS, STATUS_COLORS, type ServiceStatus } from "@/lib/orders";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: ServiceStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_COLORS[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {SERVICE_STATUS_LABELS[status]}
    </span>
  );
}
