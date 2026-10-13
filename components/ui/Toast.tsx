"use client";

import { AlertCircle, AlertTriangle, Check, Info, Megaphone, RotateCcw, X } from "lucide-react";
import type { ToastTone } from "@/types/overlay";
import { IconButton } from "./IconButton";

const ICON = { success: Check, error: AlertCircle, warning: AlertTriangle, info: Info, notice: Megaphone, undo: RotateCcw } satisfies Record<ToastTone, typeof Check>;
const STYLE = {
  success: "border-(--status-success)/30 bg-(--status-success-bg) text-(--status-success)",
  error: "border-(--status-danger)/30 bg-(--status-danger-bg) text-(--status-danger)",
  warning: "border-(--status-warning)/30 bg-(--status-warning-bg) text-(--status-warning)",
  info: "border-(--color-primary)/30 bg-(--surface-app) text-(--color-primary-ink)",
  notice: "border-(--border-app) bg-(--surface-app) text-foreground",
  undo: "border-(--toast-muted) bg-(--toast-bg) text-(--toast-text)",
} satisfies Record<ToastTone, string>;

export function Toast({ title, description, tone = "info", toneLabel, actionLabel, onAction, onDismiss, dismissLabel = "Close" }: { title: string; description?: string; tone?: ToastTone; toneLabel?: string; actionLabel?: string; onAction?: () => void; onDismiss: () => void; dismissLabel?: string }) {
  const Icon = ICON[tone];
  return (
    <div role={tone === "error" || tone === "warning" ? "alert" : "status"} data-toast-tone={tone} className={`pointer-events-auto grid shrink-0 grid-cols-[1.5rem_minmax(0,1fr)_2.75rem] items-start gap-x-2.5 rounded-(--radius-app) border border-l-4 px-3.5 py-2.5 shadow-(--shadow-panel) ${STYLE[tone]}`}>
      <span aria-hidden="true" className="mt-1 flex size-6 items-center justify-center rounded-full bg-current/10"><Icon size={18} strokeWidth={2} /></span>
      <div className="min-w-0">{toneLabel ? <p className="mb-0.5 text-[11px] font-bold">{toneLabel}</p> : null}<p className="break-words text-[12.5px] font-semibold">{title}</p>{description ? <p className="mt-1 break-words text-[11px] opacity-80">{description}</p> : null}
        {actionLabel ? <button type="button" onClick={onAction} className="mt-1 min-h-11 rounded-md px-2 text-xs font-semibold underline underline-offset-4 hover:bg-current/10">{actionLabel}</button> : null}
      </div>
      <IconButton label={dismissLabel} icon={<X size={16} />} variant="ghost" onClick={onDismiss} className="min-h-11 min-w-11 text-inherit" />
    </div>
  );
}
