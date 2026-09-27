import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: "plain" | "bordered" | "elevated";
}

export function Panel({ title, description, actions, footer, variant = "bordered", className, children, ...props }: PanelProps) {
  return (
    <section className={cn("overflow-hidden rounded-(--radius-app) bg-(--surface-app)", variant !== "plain" && "border border-(--border-app)", variant === "elevated" && "shadow-(--shadow-panel)", className)} {...props}>
      {title || description || actions ? <header className="flex items-start justify-between gap-4 border-b border-(--border-app) px-4 py-3" style={{ paddingBlock: "calc(0.75rem * var(--density-scale))" }}><div className="min-w-0">{title ? <h2 className="font-semibold">{title}</h2> : null}{description ? <p className="mt-1 text-sm text-(--text-muted)">{description}</p> : null}</div>{actions ? <div className="shrink-0">{actions}</div> : null}</header> : null}
      <div className="p-4" style={{ paddingBlock: "calc(1rem * var(--density-scale))" }}>{children}</div>
      {footer ? <footer className="border-t border-(--border-app) bg-(--surface-muted) px-4 py-3" style={{ paddingBlock: "calc(0.75rem * var(--density-scale))" }}>{footer}</footer> : null}
    </section>
  );
}
