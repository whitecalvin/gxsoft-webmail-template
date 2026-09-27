"use client";

import { useTranslations } from "next-intl";
import { useToast } from "@/context/toast-context";
import { Toast } from "@/components/ui/Toast";

export function ToastStack() {
  const { toasts, dismiss } = useToast();
  const t = useTranslations("common");
  if (toasts.length === 0) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-(--layer-toast) flex w-85 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => <Toast key={toast.id} title={toast.title} description={toast.sub} tone={toast.tone} actionLabel={toast.actionLabel} onAction={() => { toast.onAction?.(); dismiss(toast.id); }} onDismiss={() => dismiss(toast.id)} dismissLabel={t("close")} />)}
    </div>
  );
}
