"use client";

import { Children, createContext, useContext, type ReactNode } from "react";
import { cn } from "../ui/utils";
import type { DialogPlatform } from "@/lib/dialog-platform";

const PlatformContext = createContext<DialogPlatform>("standard");

export function DialogPlatformProvider({ platform, children }: { platform: DialogPlatform; children: ReactNode }) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

// Keep dialog actions in one compact row, including on narrow mobile screens.
export function DialogActions({ children, className, cancelLast = true }: { children: ReactNode; className?: string; cancelLast?: boolean }) {
  const platform = useContext(PlatformContext);
  // Callers supply optional secondary actions, primary action, then cancel.
  // Reorder actual DOM nodes, not CSS order, so Tab follows the visual order.
  const actions = Children.toArray(children);
  if (cancelLast && platform === "macos" && actions.length > 1) actions.unshift(actions.pop()!);
  return <div data-dialog-actions data-dialog-platform={platform} className={cn("flex min-w-0 flex-nowrap items-center justify-end gap-2 [&_button]:min-w-0 [&_button]:shrink [&_button]:whitespace-normal [&_button]:break-words", className)}>{actions}</div>;
}
