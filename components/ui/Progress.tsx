import { cn } from "./utils";

export function Progress({ value, max = 100, label, showValue = false, size = "md", tone = "primary", className }: { value?: number; max?: number; label?: string; showValue?: boolean; size?: "sm" | "md" | "lg"; tone?: "primary" | "success" | "warning" | "danger"; className?: string }) {
  const safeMax = max > 0 ? max : 100;
  const safeValue = value === undefined ? undefined : Math.min(Math.max(value, 0), safeMax);
  const percent = safeValue === undefined ? 0 : Math.round((safeValue / safeMax) * 100);
  const bar = tone === "success" ? "bg-(--status-success)" : tone === "warning" ? "bg-(--status-warning)" : tone === "danger" ? "bg-(--status-danger)" : "bg-(--color-primary)";
  return (
    <div className={cn("w-full", className)}>
      {label || showValue ? <div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="font-medium">{label}</span>{showValue ? <span className="text-(--text-muted)">{safeValue === undefined ? "…" : `${percent}%`}</span> : null}</div> : null}
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={safeValue} className={cn("overflow-hidden rounded-full bg-(--control-muted)", size === "sm" ? "h-1" : size === "lg" ? "h-3" : "h-2")}>
        <span className={cn("block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", bar, safeValue === undefined && "w-1/3 animate-pulse motion-reduce:animate-none")} style={safeValue === undefined ? undefined : { width: `${percent}%` }} />
      </div>
    </div>
  );
}
