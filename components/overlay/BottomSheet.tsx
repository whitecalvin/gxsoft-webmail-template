"use client";

import { useId, type ReactNode } from "react";
import { useSheetFocus } from "./use-sheet-focus";

// Mobile-only bottom sheet for picking one of several options (e.g. "move
// to folder"). BottomSheetRow renders each selectable option inside it.
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useSheetFocus(onClose);
  return (
    <div
      className="fixed inset-0 z-(--layer-modal) flex items-end justify-center bg-(--overlay-backdrop) lg:hidden"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-background pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 text-foreground outline-none"
      >
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-(--text-muted)" />
        <h2 id={titleId} className="px-4.5 pb-2.5 text-[13.5px] font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function BottomSheetRow({
  label,
  dot,
  meta,
  onClick,
}: {
  label: string;
  dot?: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 px-4.5 text-left text-[13.5px] hover:bg-black/3 dark:hover:bg-white/5"
    >
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      <span className="flex-1">{label}</span>
      {meta && <span className="text-[11.5px] text-(--text-muted)">{meta}</span>}
    </button>
  );
}
