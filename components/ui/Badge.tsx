import type { ReactNode } from "react";
import { cn } from "./utils";

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "primary" | "success" | "warning" | "danger"; className?: string }) {
  const toneClass = tone === "primary" ? "bg-(--color-primary)/10 text-(--color-primary-ink)" : tone === "success" ? "bg-(--status-success-bg) text-(--status-success)" : tone === "warning" ? "bg-(--status-warning-bg) text-(--status-warning)" : tone === "danger" ? "bg-(--status-danger-bg) text-(--status-danger)" : "bg-(--surface-muted) text-(--text-muted)";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", toneClass, className)}>{children}</span>;
}
