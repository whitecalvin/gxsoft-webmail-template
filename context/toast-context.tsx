"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { SystemErrorToasts, type SystemErrorAction } from "@/lib/system-error-toasts";
import { useTranslations } from "next-intl";
import type { ToastItem, ToastTone } from "@/types/overlay";

// Global toast/snackbar queue, rendered by components/toast/ToastStack.
// `error` toasts stay until dismissed by the user; everything else times out.
const AUTO_DISMISS_MS: Record<ToastTone, number | null> = {
  success: 4000,
  info: 4000,
  warning: 8000,
  notice: 6000,
  undo: 8000,
  error: null,
};

// Cap the visible stack so a burst of actions doesn't cover the whole screen;
// older toasts are dropped, not queued.
const MAX_TOASTS = 3;

interface PushOptions {
  sub?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  toasts: ToastItem[];
  push: (tone: ToastTone, title: string, opts?: PushOptions) => string;
  success: (title: string, opts?: PushOptions) => string;
  error: (title: string, opts?: PushOptions) => string;
  info: (title: string, opts?: PushOptions) => string;
  warning: (title: string, opts?: PushOptions) => string;
  notice: (title: string, opts?: PushOptions) => string;
  undo: (title: string, onAction: () => void, opts?: Omit<PushOptions, "onAction" | "actionLabel">) => string;
  dismiss: (id: string) => void;
  acquireSystemError: (message: string, action: SystemErrorAction) => () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, opts?: PushOptions) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: ToastItem = {
        id,
        tone,
        title,
        sub: opts?.sub,
        actionLabel: opts?.actionLabel,
        onAction: opts?.onAction,
      };
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), item]);

      const duration = AUTO_DISMISS_MS[tone];
      if (duration != null) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const systemErrors = useRef<SystemErrorToasts | null>(null);
  const acquireSystemError = useCallback((message: string, action: SystemErrorAction) => {
    systemErrors.current ??= new SystemErrorToasts((title, options) => push("error", title, options), dismiss);
    return systemErrors.current.acquire(message, action);
  }, [push, dismiss]);
  const value: ToastContextValue = {
    toasts,
    push,
    success: (title, opts) => push("success", title, opts),
    error: (title, opts) => push("error", title, opts),
    info: (title, opts) => push("info", title, opts),
    warning: (title, opts) => push("warning", title, opts),
    notice: (title, opts) => push("notice", title, opts),
    undo: (title, onAction, opts) =>
      push("undo", title, { ...opts, actionLabel: t("undo"), onAction }),
    dismiss,
    acquireSystemError,
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
