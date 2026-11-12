import { cn } from "@/lib/utils";
import logoUrl from "@/assets/vexfo-logo.png";

interface Props {
  className?: string;
  showWordmark?: boolean;
  size?: number;
  /** "dark": para fundos escuros (menu lateral) — logo em pastilha branca e texto claro. */
  tone?: "light" | "dark";
}

/**
 * VEXFO Logo oficial — imagem do "V" + wordmark "Agenda VEXFO FIBRA".
 */
export function VexfoLogo({ className, showWordmark = true, size = 40, tone = "light" }: Props) {
  const dark = tone === "dark";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          dark && "rounded-xl bg-white p-1 shadow-sm ring-1 ring-white/10",
        )}
      >
        <img
          src={logoUrl}
          alt="VEXFO FIBRA"
          width={size}
          height={size}
          className="shrink-0"
          style={{ width: size, height: size, objectFit: "contain" }}
        />
      </span>
      {showWordmark && (
        <div className="leading-tight min-w-0">
          <p className={cn("text-[10px] font-medium uppercase tracking-[0.24em]", dark ? "text-sidebar-foreground/70" : "text-muted-foreground")}>
            Agenda
          </p>
          <p className={cn("text-[15px] font-bold tracking-tight", dark ? "text-white" : "text-foreground")}>
            VEXFO <span className={dark ? "text-sky-300" : "text-primary"}>FIBRA</span>
          </p>
        </div>
      )}
    </div>
  );
}
