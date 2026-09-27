"use client";

// Admin Console > Reports & Export tab: an ad-hoc report builder, recent
// export history, and recurring scheduled reports.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  EXPORT_POLICY,
  EXPORT_ROWS,
  REPORT_COLUMNS,
  REPORT_SCHEDULES,
} from "@/lib/mock-admin";
import { AdminCard, AdminSwitch, Pill } from "../primitives";
import { useToast } from "@/context/toast-context";
import { useSettings } from "@/context/settings-context";

const FORMATS = ["CSV", "XLSX", "JSON"];

export function ReportsTab() {
  const t = useTranslations("adminReports");
  const locale = useLocale();
  const toast = useToast();
  const { saved } = useSettings();
  const [format, setFormat] = useState("CSV");
  const [columns, setColumns] = useState(REPORT_COLUMNS);
  const [schedules, setSchedules] = useState(REPORT_SCHEDULES);
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone: "UTC" });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: saved.locale.timeFormat === "12", timeZone: saved.locale.timezone });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: saved.locale.timezone });
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const cadenceText = (schedule: (typeof REPORT_SCHEDULES)[number]) => t(`cadence.${schedule.cadence}`, { day: schedule.cadence === "monthly25" ? 25 : 1, weekday: schedule.time ? weekdayFormatter.format(new Date(schedule.time)) : "", time: schedule.time ? timeFormatter.format(new Date(schedule.time)) : "" });

  const toggleCol = (id: string) =>
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));
  const toggleSchedule = (id: string) =>
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, on: !s.on } : s)));

  return (
    <div className="grid flex-1 grid-cols-[1.2fr_1fr] gap-4 overflow-y-auto p-7">
      <div className="flex flex-col gap-4">
        <AdminCard title={t("createTitle")}>
          <p className="mb-3 -mt-2 text-[11px] text-(--text-muted)">{t("limits", { days: 90, rows: 1000000 })}</p>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { id: "type", label: t("fields.type"), value: t("values.sentReport") },
              { id: "range", label: t("fields.range"), value: t("values.last7") },
              { id: "scope", label: t("fields.scope"), value: t("values.allOrganization") },
              { id: "groupBy", label: t("fields.groupBy"), value: t("values.daily") },
            ].map((f) => (
              <div key={f.id} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-(--text-muted)">{f.label}</span>
                <div className="flex h-9 items-center justify-between rounded-lg border border-(--border-app) px-2.5 text-xs">
                  {f.value}
                  <span className="text-[9px] text-(--text-muted)">▾</span>
                </div>
              </div>
            ))}
          </div>

          <p className="mb-1.5 mt-3 text-[11px] font-semibold text-(--text-muted)">{t("includedColumns")}</p>
          <div className="flex flex-wrap gap-1.5">
            {columns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCol(c.id)}
                aria-pressed={c.active}
                className={`h-7 rounded-full px-2.5 text-[11px] font-semibold transition ${
                  c.active
                    ? "bg-(--color-primary)/15 text-(--color-primary)"
                    : "bg-black/5 text-(--text-muted) dark:bg-white/10"
                }`}
              >
                {t(`reportColumns.${c.id}`)}
              </button>
            ))}
          </div>

          <p className="mb-1.5 mt-3 text-[11px] font-semibold text-(--text-muted)">{t("formatLabel")}</p>
          <div className="flex gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
                className={`h-8 flex-1 rounded-lg border text-xs font-semibold transition ${
                  format === f
                    ? "border-(--color-primary) bg-(--color-primary)/10 text-(--color-primary)"
                    : "border-(--border-app) text-(--text-muted)"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <p className="text-[11px] text-(--text-muted)">{t("estimate", { rows: 42180, size: numberFormatter.format(6) })}</p>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => toast.info(t("scheduledToast"), { sub: format })}
                className="h-8 rounded-lg border border-(--border-app) px-3 text-xs font-semibold"
              >
                {t("schedule")}
              </button>
              <button
                type="button"
                onClick={() => toast.success(t("exportStarted"), { sub: t("exportToastDetail", { format, rows: 42180 }) })}
                className="h-8 rounded-lg px-3 text-xs font-semibold text-white"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {t("export")}
              </button>
            </div>
          </div>
        </AdminCard>

        <AdminCard title={t("exportPolicyTitle")}>
          <ul className="flex flex-col gap-1.5">
            {EXPORT_POLICY.map((p) => (
              <li key={p} className="flex gap-2 text-[11.5px] leading-relaxed text-(--text-muted)">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-(--color-primary)" />
                {t(`exportPolicy.${p}`)}
              </li>
            ))}
          </ul>
        </AdminCard>
      </div>

      <div className="flex flex-col gap-4">
        <AdminCard title={t("recentExportsTitle")}>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_60px_50px_54px_50px] gap-1 text-[10px] font-bold uppercase text-(--text-muted)">
              <span>{t("exportColumns.report")}</span>
              <span>{t("exportColumns.requestedBy")}</span>
              <span>{t("exportColumns.size")}</span>
              <span>{t("exportColumns.completed")}</span>
              <span>{t("exportColumns.status")}</span>
            </div>
            {EXPORT_ROWS.map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_60px_50px_54px_50px] items-center gap-1 border-t border-(--border-app) pt-2 text-[11px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{e.name}</p>
                  <p className="truncate text-[10px] text-(--text-muted)">{t("dateRange", { from: dateFormatter.format(new Date(`${e.from}T00:00:00Z`)), to: dateFormatter.format(new Date(`${e.to}T00:00:00Z`)) })}</p>
                </div>
                <span className="truncate text-(--text-muted)">{e.by}</span>
                <span className="text-(--text-muted)">{e.sizeMb === null ? e.state === "generating" ? t("exportStates.generating") : t("notAvailable") : t("megabytes", { value: numberFormatter.format(e.sizeMb) })}</span>
                <span className="text-(--text-muted)">{e.when === "minutesAgo" ? relativeFormatter.format(-5, "minute") : t(`exportWhen.${e.when}`)}</span>
                <Pill label={t(`exportStates.${e.state}`)} tone={e.tone} />
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title={t("scheduledReportsTitle")}>
          <div className="flex flex-col gap-2.5">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{s.name}</p>
                  <p className="truncate text-[10.5px] text-(--text-muted)">
                    {cadenceText(s)} · {s.recipientCount ? t("recipientCount", { recipient: s.to, count: s.recipientCount }) : s.to}
                  </p>
                </div>
                <AdminSwitch on={s.on} onToggle={() => toggleSchedule(s.id)} label={s.name} />
              </div>
            ))}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
