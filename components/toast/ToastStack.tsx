"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/context/toast-context";
import { Toast } from "@/components/ui/Toast";

const subscribe = () => () => {};

export function ToastStack() {
  const { toasts, dismiss } = useToast();
  const t = useTranslations("common");
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted || toasts.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-(--layer-toast) flex max-h-[50dvh] flex-col gap-2 overflow-y-auto lg:left-4 lg:right-auto lg:w-85 lg:max-w-[calc(100vw-2rem)] lg:bottom-4">
      {toasts.map((toast) => <Toast key={toast.id} title={toast.title} description={toast.sub} tone={toast.tone} toneLabel={t(`toastKinds.${toast.tone}`)} actionLabel={toast.actionLabel} onAction={() => { toast.onAction?.(); dismiss(toast.id); }} onDismiss={() => dismiss(toast.id)} dismissLabel={t("close")} />)}
    </div>,
    document.body,
  );
}
