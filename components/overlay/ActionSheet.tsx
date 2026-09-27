"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { useSheetFocus } from "./use-sheet-focus";

// Mobile-only (see `lg:hidden`) bottom action sheet — the small-screen
// equivalent of a right-click / "..." context menu on desktop.
export interface ActionSheetItem {
  label: string;
  destructive?: boolean;
  onClick: () => void;
}

export function ActionSheet({
  context,
  items,
  onClose,
}: {
  context?: string;
  items: ActionSheetItem[];
  onClose: () => void;
}) {
  const t = useTranslations("common");
  const contextId = useId();
  const panelRef = useSheetFocus(onClose);
  return (
    <div
      className="fixed inset-0 z-(--layer-modal) flex items-end justify-center bg-(--overlay-backdrop) p-2.5 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={context ? contextId : undefined}
        aria-label={context ? undefined : items.map((item) => item.label).join(", ")}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-2 outline-none"
      >
        <div className="overflow-hidden rounded-[13px] bg-background text-foreground">
          {context && (
            <p id={contextId} className="border-b border-(--border-app) px-3.5 py-2.5 text-center text-[11.5px] leading-relaxed text-(--text-muted)">
              {context}
            </p>
          )}
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={`flex min-h-11 w-full items-center justify-center text-[14px] font-semibold ${
                i < items.length - 1 ? "border-b border-(--border-app)" : ""
              }`}
              style={{ color: item.destructive ? "var(--status-danger)" : "var(--color-primary-ink)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-11 w-full items-center justify-center rounded-[13px] bg-background text-[14px] font-bold text-foreground"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
