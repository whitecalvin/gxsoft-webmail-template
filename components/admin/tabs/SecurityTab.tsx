"use client";

// Admin Console > Security & Spam tab: aggregate detection KPIs and a
// filterable log of blocked/quarantined mail. Distinct from the personal
// security page and from the org-wide Audit Log tab.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { LOG_FILTERS, SEC_KPIS, SEC_LOGS } from "@/lib/mock-admin";
import { AdminCard, Pill } from "../primitives";
import { useToast } from "@/context/toast-context";
import { useSettings } from "@/context/settings-context";

export function SecurityTab() {
  const t = useTranslations("adminSecurity");
  const locale = useLocale();
  const toast = useToast();
  const { saved } = useSettings();
  const [filter, setFilter] = useState<(typeof LOG_FILTERS)[number]>("all");
  const filteredLogs = SEC_LOGS.filter((l) => filter === "all" || l.kind === filter);
  const numberFormatter = new Intl.NumberFormat(locale);
  const percentFormatter = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: saved.locale.timeFormat === "12", timeZone: saved.locale.timezone });

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div className="grid grid-cols-4 gap-4">
        {SEC_KPIS.map((k) => (
          <AdminCard key={k.id}>
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base"
                style={{ backgroundColor: k.bg, color: k.fg }}
              >
                {k.icon}
              </span>
              <div>
                <p className="text-lg font-bold">{k.id === "accuracy" ? percentFormatter.format(k.value) : numberFormatter.format(k.value)}</p>
                <p className="text-[11px] text-(--text-muted)">{t(`kpis.${k.id}`)}</p>
              </div>
            </div>
          </AdminCard>
        ))}
      </div>

      <AdminCard className="flex flex-1 flex-col" title={t("logTitle")}>
        <div className="mb-3 flex items-center gap-2">
          {LOG_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`h-7 rounded-full px-3 text-xs font-semibold transition ${
                filter === f
                  ? "bg-[#17181B] text-white dark:bg-white dark:text-[#17181B]"
                  : "bg-black/5 text-(--text-muted) dark:bg-white/10"
              }`}
            >
              {t(`filters.${f}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => toast.success(t("exportStarted"), { sub: t("rowCount", { count: filteredLogs.length }) })}
            className="ml-auto flex h-7 items-center gap-1.5 rounded-lg border border-(--border-app) px-2.5 text-xs font-semibold"
          >
            <Download size={12} />
            {t("exportCsv")}
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-(--border-app)">
          <div className="grid grid-cols-[110px_1.6fr_1.7fr_1fr_70px_80px] gap-2 border-b border-(--border-app) bg-black/2 px-3 py-2 text-[10.5px] font-bold uppercase tracking-[.03em] text-(--text-muted) dark:bg-white/3">
            <span>{t("columns.time")}</span>
            <span>{t("columns.sender")}</span>
            <span>{t("columns.subjectReason")}</span>
            <span>{t("columns.recipient")}</span>
            <span>{t("columns.score")}</span>
            <span>{t("columns.action")}</span>
          </div>
          {filteredLogs.length === 0 && (
            <p className="p-6 text-center text-xs text-(--text-muted)">{t("empty")}</p>
          )}
          {filteredLogs.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-[110px_1.6fr_1.7fr_1fr_70px_80px] items-center gap-2 border-b border-(--border-app) px-3 py-2.5 text-xs last:border-b-0 hover:bg-black/1.5 dark:hover:bg-white/2"
            >
              <span className="text-(--text-muted)">{timeFormatter.format(new Date(l.time))}</span>
              <span className="truncate font-mono text-[11px]">{l.from}</span>
              <span className="truncate">{l.subject}{"reason" in l ? ` (${t(`reasons.${l.reason}`)})` : ""}</span>
              <span className="truncate text-(--text-muted)">{l.to === "allStaff" || l.to === "purchasing" || l.to === "multiple" ? t(`recipients.${l.to}`) : l.to}</span>
              <span
                className="font-bold"
                style={{ color: l.score >= 90 ? "#C0433B" : l.score >= 50 ? "#E0AC4A" : "#2E8B5B" }}
              >
                {numberFormatter.format(l.score)}
              </span>
              <Pill label={t(`actions.${l.action}`)} tone={l.tone} />
            </div>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}
