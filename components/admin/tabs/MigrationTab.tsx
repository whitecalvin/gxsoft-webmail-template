"use client";

// Admin Console > Mailbox Migration tab: progress of migrating mailboxes in
// from another mail system, batch-by-batch, with a failure/skip breakdown.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MIG_BATCHES, MIG_ERRORS, MIG_KPIS } from "@/lib/mock-admin";
import { AdminCard, Pill, ProgressBar, Sparkline } from "../primitives";
import { useToast } from "@/context/toast-context";

const TONE_COLOR: Record<string, string> = {
  success: "#2E8B5B",
  info: "#2B4BF2",
  neutral: "#9A9EA5",
  warning: "#E0AC4A",
  danger: "#C0433B",
};

const MIG_BARS = Array.from({ length: 24 }, (_, i) => 40 + Math.round(Math.sin(i / 2) * 25 + (i % 5) * 5));

export function MigrationTab() {
  const t = useTranslations("adminMigration");
  const locale = useLocale();
  const toast = useToast();
  const [errors, setErrors] = useState(MIG_ERRORS);
  const numberFormatter = new Intl.NumberFormat(locale);
  const percentFormatter = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 3 });
  const kpiNote = (id: string, value: number) => id === "accounts" || id === "failed" ? percentFormatter.format(value) : numberFormatter.format(value);

  const retryAll = () => {
    const total = errors.reduce((sum, e) => sum + e.count, 0);
    setErrors([]);
    toast.success(t("retryStarted"), { sub: t("itemCount", { count: total }) });
  };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div className="grid grid-cols-4 gap-4">
        {MIG_KPIS.map((k) => (
          <AdminCard key={k.id}>
            <p className="text-xs text-(--text-muted)">{t(`kpis.${k.id}.label`)}</p>
            <p className="mt-1 text-xl font-bold tracking-tight">{t(`kpis.${k.id}.value`, { value: numberFormatter.format(k.value), total: numberFormatter.format(1284) })}</p>
            <p className="mt-1 text-[11px] text-(--text-muted)">{t(`kpis.${k.id}.note`, { value: kpiNote(k.id, k.noteValue) })}</p>
          </AdminCard>
        ))}
      </div>

      <AdminCard title={t("batchProgressTitle")}>
        <p className="mb-3 -mt-2 text-[11px] text-(--text-muted)">{t("batchLimits", { parallel: 4, bandwidth: 200 })}</p>
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-[110px_60px_1fr_90px_70px] gap-2 text-[10px] font-bold uppercase text-(--text-muted)">
            <span>{t("columns.batch")}</span>
            <span>{t("columns.accounts")}</span>
            <span>{t("columns.progress")}</span>
            <span>{t("columns.remaining")}</span>
            <span>{t("columns.status")}</span>
          </div>
          {MIG_BATCHES.map((b) => (
            <div key={b.id} className="grid grid-cols-[110px_60px_1fr_90px_70px] items-center gap-2 border-t border-(--border-app) pt-2.5 text-xs">
              <div>
                <p className="font-semibold">{t("batchName", { number: b.id })}</p>
                <p className="text-[10.5px] text-(--text-muted)">{b.source === "otherImap" || b.source === "mixed" ? t(`sources.${b.source}`) : b.source}</p>
              </div>
              <span>{numberFormatter.format(b.accounts)}</span>
              <ProgressBar pct={b.pct} color={TONE_COLOR[b.tone]} />
              <span className="text-(--text-muted)">{b.etaMinutes ? t("minutesRemaining", { count: b.etaMinutes }) : t(`states.${b.state}`)}</span>
              <Pill label={t(`states.${b.state}`)} tone={b.tone} />
            </div>
          ))}
        </div>
      </AdminCard>

      <div className="grid grid-cols-2 gap-4">
        <AdminCard title={t("throughputTitle")}>
          <Sparkline bars={MIG_BARS} height={70} />
          <p className="mt-2 text-[11px] text-(--text-muted)">{t("throughputSummary", { average: 1840, peak: 3210 })}</p>
        </AdminCard>

        <AdminCard
          title={t("errorsTitle")}
          action={
            errors.length > 0 && (
              <button
                type="button"
                onClick={retryAll}
                className="text-[11px] font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                {t("retryAll")}
              </button>
            )
          }
        >
          <div className="flex flex-col gap-2">
            {errors.length === 0 && <p className="text-xs text-(--text-muted)">{t("noErrors")}</p>}
            {errors.map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: TONE_COLOR[e.tone] }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{t(`errors.${e.id}.reason`)}</p>
                  <p className="truncate text-[10.5px] text-(--text-muted)">{t(`errors.${e.id}.detail`)}</p>
                </div>
                <span className="shrink-0 text-xs font-bold">{numberFormatter.format(e.count)}</span>
              </div>
            ))}
          </div>
        </AdminCard>
      </div>

      <p className="text-[11px] text-(--text-muted)">
        {t("syncNotice", { days: 7 })}
      </p>
    </div>
  );
}
