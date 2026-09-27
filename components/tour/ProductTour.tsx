"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { TOUR_CHECKLIST, TOUR_STEPS } from "@/lib/mock-tour";

// First-run overlay combining a step-by-step spotlight card (top-left) with
// a "getting started" checklist card (bottom-right). Both are purely
// illustrative — checking an item off doesn't unlock anything.
export function ProductTour({ onClose }: { onClose: () => void }) {
  const t = useTranslations("productTour");
  const [step, setStep] = useState(0);
  const [checklist, setChecklist] = useState(TOUR_CHECKLIST);
  const doneCount = checklist.filter((c) => c.done).length;
  const current = TOUR_STEPS[step];

  const toggleItem = (id: (typeof TOUR_CHECKLIST)[number]["id"]) =>
    setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));

  return (
    <div className="fixed inset-0 z-(--layer-modal)">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute left-4 top-4 w-[calc(100%-2rem)] max-w-93 rounded-2xl bg-background p-5 shadow-2xl sm:left-8 sm:top-8">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: "var(--color-primary-ink)" }}>
            {step + 1} / {TOUR_STEPS.length}
          </span>
          <button type="button" onClick={onClose} className="ml-auto text-xs font-medium text-(--text-muted) hover:text-foreground">
            {t("skip")}
          </button>
        </div>
        <h3 className="text-[15px] font-bold">{t(`steps.${current.id}.title`)}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-(--text-muted)">{t(`steps.${current.id}.body`)}</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: i === step ? "var(--color-primary)" : "var(--border-app)" }}
              />
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="h-8 rounded-full border border-(--border-app) px-3 text-xs font-semibold disabled:opacity-40"
            >
              {t("previous")}
            </button>
            <button
              type="button"
              onClick={() => (step === TOUR_STEPS.length - 1 ? onClose() : setStep((s) => s + 1))}
              className="h-8 rounded-full px-3 text-xs font-semibold text-white"
              style={{ backgroundColor: "var(--color-primary-solid)" }}
            >
              {step === TOUR_STEPS.length - 1 ? t("finish") : t("next")}
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 w-[calc(100%-2rem)] max-w-82.5 rounded-2xl border border-(--border-app) bg-background p-4 shadow-2xl sm:bottom-6 sm:right-6">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-sm font-bold">{t("getStarted")}</p>
          <button type="button" onClick={onClose} className="ml-auto text-(--text-muted)" aria-label={t("close")}>
            <X size={14} />
          </button>
        </div>
        <p className="mb-2 text-[11px] text-(--text-muted)">
          {t("progress", { done: doneCount, total: checklist.length })}
        </p>
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div
            className="h-full rounded-full"
            style={{ width: `${(doneCount / checklist.length) * 100}%`, backgroundColor: "var(--color-primary-solid)" }}
          />
        </div>
        <div className="flex flex-col gap-2">
          {checklist.map((item) => (
            <button key={item.id} type="button" onClick={() => toggleItem(item.id)} className="flex items-center gap-2 text-left">
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]"
                style={{
                  backgroundColor: item.done ? "var(--status-success)" : "transparent",
                  border: item.done ? "none" : "1px solid var(--border-app)",
                }}
              >
                {item.done && <Check size={10} strokeWidth={3} className="text-white" />}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-xs"
                style={{
                  color: item.done ? "var(--text-muted)" : "var(--text-app)",
                  textDecoration: item.done ? "line-through" : "none",
                }}
              >
                {t(`checklist.${item.id}`)}
              </span>
              {item.minutes && !item.done && (
                <span className="shrink-0 text-[10.5px] text-(--text-muted)">{t("minutes", { count: item.minutes })}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
