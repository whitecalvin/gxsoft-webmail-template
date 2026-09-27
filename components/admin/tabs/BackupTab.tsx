"use client";

// Admin Console > Backup & Retention tab: backup KPIs, retention policies,
// in-progress mailbox restores, and legal-hold status.
import { BACKUP_KPIS, RESTORE_JOBS, RETENTION_POLICIES } from "@/lib/mock-admin";
import { useLocale, useTranslations } from "next-intl";
import { AdminCard, Pill, ProgressBar } from "../primitives";
import { useToast } from "@/context/toast-context";
import { useSettings } from "@/context/settings-context";

const TONE_COLOR: Record<string, string> = {
  success: "#2E8B5B",
  info: "#2B4BF2",
  neutral: "#9A9EA5",
  danger: "#C0433B",
};

export function BackupTab() {
  const t = useTranslations("adminBackup");
  const locale = useLocale();
  const toast = useToast();
  const { saved } = useSettings();
  const numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: saved.locale.timeFormat === "12", timeZone: saved.locale.timezone });
  const snapshotFormatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const formatMetric = (value: number | string) => typeof value === "number" ? numberFormatter.format(value) : timeFormatter.format(new Date(value));
  const jobMeta = (id: string) => id === "restoring" ? t("jobMeta.restoring", { time: timeFormatter.format(new Date("2026-09-13T11:40:00+09:00")) }) : id === "completed" ? t("jobMeta.completed", { count: 3 }) : id === "pending" ? t("jobMeta.pending", { count: 2 }) : t("jobMeta.failed");
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div className="grid grid-cols-4 gap-4">
        {BACKUP_KPIS.map((k) => (
          <AdminCard key={k.id}>
            <p className="text-xs text-(--text-muted)">{t(`kpis.${k.id}.label`)}</p>
            <p className="mt-1 text-xl font-bold tracking-tight">{t(`kpis.${k.id}.value`, { value: formatMetric(k.value) })}</p>
            <p className="mt-1 text-[11px] text-(--text-muted)">{t(`kpis.${k.id}.note`, { value: formatMetric(k.noteValue) })}</p>
          </AdminCard>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <AdminCard title={t("retentionTitle")}>
          <div className="flex flex-col gap-2">
            {RETENTION_POLICIES.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-(--border-app) px-3 py-2">
                <div>
                  <p className="text-xs font-semibold">{t(`policies.${r.id}.name`)}</p>
                  <p className="text-[10.5px] text-(--text-muted)">{t(`policies.${r.id}.scope`)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold">{t("years", { count: r.years })}</p>
                  <p className="text-[10.5px] text-(--text-muted)">{t(`policyModes.${r.mode}`)}</p>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title={t("restoreTitle")}>
          <div className="flex flex-col gap-3">
            {RESTORE_JOBS.map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{t("jobName", { owner: r.owner, kind: t(`mailboxKinds.${r.kind}`), date: snapshotFormatter.format(new Date(`${r.snapshotDate}T00:00:00Z`)) })}</span>
                  <Pill label={t(`jobStates.${r.state}`)} tone={r.tone} />
                </div>
                <ProgressBar pct={r.pct} color={TONE_COLOR[r.tone]} />
                <p className="mt-1 text-[10.5px] text-(--text-muted)">{jobMeta(r.id)}</p>
              </div>
            ))}
          </div>
        </AdminCard>
      </div>

      <div className="rounded-xl p-4" style={{ backgroundColor: "#17181B" }}>
        <h3 className="text-[13px] font-bold text-white">{t("legalHoldTitle")}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-white/60">
          {t("legalHoldDescription", { audits: 2, accounts: 6 })}
        </p>
        <button
          type="button"
          onClick={() => toast.info(t("legalHoldToast", { count: 6 }), { sub: t("activeAudits", { count: 2 }) })}
          className="mt-2.5 h-8 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white"
        >
          {t("viewTargets")}
        </button>
      </div>
    </div>
  );
}
