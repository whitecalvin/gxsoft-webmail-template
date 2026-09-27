import type { ReactNode } from "react";
import { cn } from "./utils";

export function Tooltip({ content, children, side = "top", className }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom"; className?: string }) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span role="tooltip" className={cn("pointer-events-none absolute left-1/2 z-(--layer-tooltip) -translate-x-1/2 whitespace-nowrap rounded-md bg-(--toast-bg) px-2 py-1 text-[11px] font-medium text-(--toast-text) opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100", side === "top" ? "bottom-full mb-2" : "top-full mt-2")}>{content}</span>
    </span>
  );
}
