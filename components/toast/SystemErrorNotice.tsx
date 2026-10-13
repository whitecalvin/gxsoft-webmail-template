"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useToast } from "@/context/toast-context";

// Connection/system failures never enter the content flow, on any viewport.
// Legacy presentation props remain accepted so existing hosts can migrate safely.
export function SystemErrorNotice({ message, actionLabel, onAction, reloadOnAction = false }: {
  message: string; actionLabel?: string; onAction?: () => void; reloadOnAction?: boolean; children?: ReactNode; toastOnly?: boolean; className?: string;
}) {
  const { acquireSystemError } = useToast();
  const action = useRef(onAction);
  useEffect(() => { action.current = onAction; }, [onAction]);
  useEffect(() => {
    return acquireSystemError(message, { actionLabel, onAction: actionLabel ? () => { if (reloadOnAction) window.location.reload(); else action.current?.(); } : undefined });
  }, [message, actionLabel, reloadOnAction, acquireSystemError]);
  return null;
}
