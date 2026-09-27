"use client";

// Admin Console > Overview tab: org-wide KPIs, throughput chart, domain
// auth status, alerts, reputation, and the live send queue.
import {
  AUTH_ROWS,
  DASH_ALERTS,
  FUNNEL,
  KPIS,
  QUEUE_ROWS,
  QUEUE_STATS,
  REPUTATION,
  THROUGHPUT_CHART,
} from "@/lib/mock-admin";
import { AdminCard, KpiCard, Pill, ProgressBar } from "../primitives";
import { useToast } from "@/context/toast-context";
import { useLocale, useTranslations } from "next-intl";

export function DashboardTab() {
  const locale = useLocale();
  const t = useTranslations("adminDashboard");
  const toast = useToast();
  const maxBar = Math.max(...THROUGHPUT_CHART.flatMap((d) => [d.a, d.b, d.c]));
  const count = new Intl.NumberFormat(locale);
  const percentage = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const precisePercentage = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 });
  const seconds = new Intl.NumberFormat(locale, { style: "unit", unit: "second", unitDisplay: "narrow", maximumFractionDigits: 1 });
  const metric = (value: number, format: string, signed = false) => {
    const options: Intl.NumberFormatOptions = format === "percent"
      ? { style: "percent", maximumFractionDigits: 1 }
      : format === "seconds"
        ? { style: "unit", unit: "second", unitDisplay: "narrow", maximumFractionDigits: 1 }
        : {};
    return new Intl.NumberFormat(locale, { ...options, signDisplay: signed ? "always" : "auto" }).format(value);
  };
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div className="grid grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <KpiCard key={k.id} label={t(`kpis.${k.id}`)} value={metric(k.value, k.valueFormat)} delta={metric(k.delta, k.deltaFormat, true)} deltaUp={k.deltaUp} bars={k.bars} />
        ))}
      </div>

      <div className="grid grid-cols-[1.55fr_1fr] gap-4">
        <AdminCard title={t("throughputTitle")}>
          <div className="mb-2 flex items-center gap-3 text-[11px] text-(--text-muted)">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#2B4BF2" }} />
              {t("received")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#B9C6FA" }} />
              {t("sent")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#E3B5B0" }} />
              {t("blocked")}
            </span>
          </div>
          <div className="flex h-35 items-end justify-between gap-3">
            {THROUGHPUT_CHART.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-27.5 w-full items-end justify-center gap-0.75">
                  {[
                    { v: d.a, c: "#2B4BF2" },
                    { v: d.b, c: "#B9C6FA" },
                    { v: d.c, c: "#E3B5B0" },
                  ].map((bar, i) => (
                    <span
                      key={i}
                      className="w-2 rounded-sm"
                      style={{ height: `${(bar.v / maxBar) * 100}%`, backgroundColor: bar.c }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-(--text-muted)">{weekday.format(new Date(Date.UTC(2024, 0, 1 + d.day)))}</span>
              </div>
            ))}
          </div>
        </AdminCard>

        <div className="flex flex-col gap-4">
          <AdminCard title={t("authTitle")}>
            <div className="flex flex-col gap-2.5">
              {AUTH_ROWS.map((a) => (
                <div key={a.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold">{a.name}</span>
                    <span style={{ color: a.color }} className="font-semibold">
                      {percentage.format(a.pct / 100)} · {t(`authStatus.${a.status}`)}
                    </span>
                  </div>
                  <ProgressBar pct={a.pct} color={a.color} />
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminCard
            title={t("alertsTitle")}
            action={
              <button
                type="button"
                onClick={() => toast.info(t("openAlerts"), { sub: t("itemCount", { count: DASH_ALERTS.length }) })}
                className="text-[11px] font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                {t("all")}
              </button>
            }
          >
            <div className="flex flex-col gap-2.5">
              {DASH_ALERTS.map((al) => (
                <div key={al.id} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: al.color }} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{t(`alerts.${al.id}.title`)}</p>
                    <p className="text-[11px] text-(--text-muted)">{t(`alerts.${al.id}.desc`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <AdminCard title={t("funnelTitle")}>
          <div className="flex flex-col gap-2">
            {FUNNEL.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-(--text-muted)">{t(`funnel.${f.id}`)}</span>
                <span className="w-16 shrink-0 text-right font-semibold">{count.format(f.value)}</span>
                <Pill label={percentage.format(f.pct)} tone={f.tone} />
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-(--border-app) pt-2 text-[11px] text-(--text-muted)">
            {t("averageDelay")} <span className="font-semibold text-[#2E8B5B]">{seconds.format(1.8)}</span> · SLA {seconds.format(5)}
          </p>
        </AdminCard>

        <AdminCard title={t("reputationTitle")}>
          <div className="flex flex-col gap-2.5">
            {REPUTATION.map((r) => (
              <div key={r.domain} className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{
                    backgroundColor: r.score >= 90 ? "#2E8B5B" : r.score >= 80 ? "#E0AC4A" : "#C0433B",
                  }}
                >
                  {r.score}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{r.domain}</p>
                  <p className="truncate text-[10.5px] text-(--text-muted)">
                    {t("reputationMetrics", { spam: precisePercentage.format(r.spam), bounce: percentage.format(r.bounce) })}
                  </p>
                </div>
                <span
                  className="shrink-0 text-xs font-bold"
                  style={{
                    color: r.trendUp === true ? "#2E8B5B" : r.trendUp === false ? "#C0433B" : "#9A9EA5",
                  }}
                >
                  {r.trend}
                </span>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard
          title={t("queueTitle")}
          action={
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#2E8B5B]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2E8B5B]" />
              {t("live")}
            </span>
          }
        >
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            {QUEUE_STATS.map((q) => (
              <div key={q.id}>
                <p className="text-sm font-bold">{count.format(q.value)}</p>
                <p className="text-[10px] text-(--text-muted)">{t(`queueStats.${q.id}`)}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {QUEUE_ROWS.map((q) => (
              <div key={q.what} className="flex items-center gap-2 text-[11px]">
                <span className="shrink-0 text-(--text-muted)">{q.time}</span>
                <span className="min-w-0 flex-1 truncate">{q.what}</span>
                <Pill label={t(`queueState.${q.state}`)} tone={q.tone} />
              </div>
            ))}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
