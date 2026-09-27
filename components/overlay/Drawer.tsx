"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { lockBodyScroll } from "@/lib/overlay-scroll-lock";

// Full-height right-edge panel for showing detail views without leaving the
// current page (e.g. an audit log entry). Closes on Escape or backdrop click.
export function Drawer({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) { e.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      unlock();
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-(--layer-drawer) flex justify-end bg-(--overlay-backdrop)"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-115 flex-col bg-background text-foreground shadow-[-18px_0_40px_-20px_rgba(20,22,30,.5)] outline-none"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-(--border-app) px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p id={titleId} className="truncate text-[13.5px] font-bold">{title}</p>
            {subtitle && (
              <p className="truncate text-[11.5px] text-(--text-muted)">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-(--text-muted) hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t("close")}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {footer && (
          <div className="flex shrink-0 gap-2 border-t border-(--border-app) p-3.5">{footer}</div>
        )}
      </div>
    </div>
  );
}
