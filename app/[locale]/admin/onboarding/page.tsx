"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, RefreshCw, Upload } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DNS_RECORDS, MIGRATIONS, ONBOARD_STEPS } from "@/lib/mock-onboarding";
import { useToast } from "@/context/toast-context";

// Org-admin onboarding wizard (/admin/onboarding): DNS record setup, bulk
// account import, and legacy-mail migration progress. Distinct from /setup,
// which is the one-time server installer.
const STATE_TONE: Record<string, string> = {
  success: "bg-(--status-success-bg) text-(--status-success)",
  warning: "bg-(--status-warning-bg) text-(--status-warning)",
  neutral: "bg-black/6 text-(--text-muted) dark:bg-white/8",
};

export default function OnboardingPage() {
  const t = useTranslations("adminOnboarding");
  const format = useFormatter();
  const toast = useToast();
  const doneCount = ONBOARD_STEPS.filter((s) => s.status === "done").length;
  const progress = Math.round((doneCount / ONBOARD_STEPS.length) * 100) + 5;
  const [dnsRecords, setDnsRecords] = useState(DNS_RECORDS);
  const [dnsChecking, setDnsChecking] = useState(false);

  const copyAllDns = () => {
    const text = dnsRecords.map((r) => `${r.type}\t${r.host}\t${r.value}`).join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
    toast.success(t("copiedNotice"), { sub: t("recordCount", { count: dnsRecords.length }) });
  };

  const recheckDns = () => {
    setDnsChecking(true);
    toast.info(t("recheckNotice"));
    window.setTimeout(() => {
      setDnsRecords((prev) => prev.map((r) => ({ ...r, state: "verified", tone: "success" as const })));
      setDnsChecking(false);
      toast.success(t("recheckSuccess"), { sub: t("verifiedCount", { total: dnsRecords.length, verified: dnsRecords.length }) });
    }, 800);
  };

  return (
    <main className="min-h-dvh bg-(--surface-muted) text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
        <header className="flex items-center gap-3">
          <div>
            <h1 className="text-[19px] font-bold tracking-tight">{t("title")}</h1>
            <p className="text-xs text-(--text-muted)">
              {t("subtitle", { domain: "gxsoft.co.kr", step: 2, minutes: 20 })}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="h-1.5 w-42.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: "var(--color-primary)" }} />
            </div>
            <span className="text-xs font-bold" style={{ color: "var(--color-primary)" }}>
              {format.number(progress / 100, { style: "percent", maximumFractionDigits: 0 })}
            </span>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-2 rounded-xl border border-(--border-app) bg-background p-4">
            {ONBOARD_STEPS.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2"
                style={{ backgroundColor: s.status === "now" ? "#F5F7FF" : "transparent" }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: s.status === "done" ? "var(--status-success-bg)" : s.status === "now" ? "var(--color-primary)" : "black/5",
                    color: s.status === "done" ? "var(--status-success)" : s.status === "now" ? "#fff" : "var(--text-muted)",
                  }}
                >
                  {s.status === "done" ? <Check size={12} /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{t(`steps.${s.id}.name`)}</p>
                  <p className="truncate text-[10.5px] text-(--text-muted)">{t(`steps.${s.id}.description`)}</p>
                </div>
              </div>
            ))}
            <p className="mt-2 border-t border-(--border-app) pt-3 text-[10.5px] leading-relaxed text-(--text-muted)">
              {t("dnsDelayNotice")}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-(--border-app) bg-background p-4">
              <div className="mb-3 flex items-center gap-2">
                <p className="text-sm font-bold">{t("dnsTitle")}</p>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={copyAllDns}
                    className="h-8 rounded-lg border border-(--border-app) px-3 text-xs font-semibold"
                  >
                    {t("copyAll")}
                  </button>
                  <button
                    type="button"
                    onClick={recheckDns}
                    disabled={dnsChecking}
                    className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: "#17181B" }}
                  >
                    <RefreshCw size={12} className={dnsChecking ? "animate-spin" : undefined} />
                    {dnsChecking ? t("checking") : t("recheck")}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-(--border-app) text-left text-[10px] font-bold uppercase text-(--text-muted)">
                      <th className="pb-2 pr-2">{t("headers.type")}</th>
                      <th className="pb-2 pr-2">{t("headers.host")}</th>
                      <th className="pb-2 pr-2">{t("headers.value")}</th>
                      <th className="pb-2 pr-2">{t("headers.priority")}</th>
                      <th className="pb-2">{t("headers.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dnsRecords.map((r, i) => (
                      <tr key={i} className="border-b border-(--border-app) last:border-b-0">
                        <td className="py-2 pr-2 font-mono">{r.type}</td>
                        <td className="py-2 pr-2 font-mono">{r.host}</td>
                        <td className="max-w-55 truncate py-2 pr-2 font-mono text-(--text-muted)">{r.value}</td>
                        <td className="py-2 pr-2 text-(--text-muted)">{r.prio}</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATE_TONE[r.tone]}`}>{t(`dnsStates.${r.state}`)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-(--border-app) bg-background p-4">
                <p className="mb-3 text-sm font-bold">{t("csvTitle")}</p>
                <button
                  type="button"
                  onClick={() => toast.info(t("csvSelectNotice"))}
                  className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-(--border-app) text-(--text-muted) transition hover:bg-black/2 dark:hover:bg-white/3"
                >
                  <Upload size={18} />
                  <span className="text-[11px]">{t("csvSelect")}</span>
                </button>
                <p className="mt-2 text-[10.5px] text-(--text-muted)">{t("csvColumns")}</p>
                <p className="mt-1 text-[11px] font-semibold text-(--status-success)">{t("csvSummary", { rows: 1284, duplicates: 3 })}</p>
              </div>
              <div className="rounded-xl border border-(--border-app) bg-background p-4">
                <p className="mb-3 text-sm font-bold">{t("migrationTitle")}</p>
                <div className="flex flex-col gap-2.5">
                  {MIGRATIONS.map((m) => (
                    <div key={m.source}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold">{m.id === "imap" ? t("migrationImap") : m.source}</span>
                        <span className="text-(--text-muted)">{format.number(m.percent / 100, { style: "percent", maximumFractionDigits: 0 })}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${m.percent}%`, backgroundColor: "var(--color-primary)" }} />
                      </div>
                      <p className="mt-1 text-[10.5px] text-(--text-muted)">
                        {m.completed === null || m.total === null ? t("migrationPending") : t("migrationCounts", { completed: m.completed, total: m.total })}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] text-(--text-muted)">
                  {t("migrationNotice")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link href="/admin" className="h-9 rounded-lg border border-(--border-app) px-4 text-xs font-semibold leading-9">
            {t("continueLater")}
          </Link>
          <button
            type="button"
            onClick={() => toast.info(t("nextNotice"))}
            className="h-9 rounded-lg px-4 text-xs font-semibold text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {t("next")}
          </button>
        </div>
      </div>
    </main>
  );
}
