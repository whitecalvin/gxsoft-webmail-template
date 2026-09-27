"use client";

// Admin Console > Domain & Policy tab: verified sending domains, send-rate
// limits, org-wide mail policy toggles, and the AI-feature rollout plan.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { AI_ROLLOUT, DOMAINS, POLICY_TOGGLES, SEND_LIMITS } from "@/lib/mock-admin";
import { AdminCard, AdminSwitch, Pill } from "../primitives";
import { useToast } from "@/context/toast-context";

export function PolicyTab() {
  const t = useTranslations("adminPolicy");
  const locale = useLocale();
  const toast = useToast();
  const [toggles, setToggles] = useState(POLICY_TOGGLES);
  const [syncing, setSyncing] = useState(false);
  const [syncedNow, setSyncedNow] = useState(false);
  const dateFormatter = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", timeZone: "UTC" });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const lastSync = syncedNow ? t("justNow") : t("todayAt", { time: timeFormatter.format(new Date(Date.UTC(2026, 8, 1, 3, 2))) });

  const toggle = (key: string) =>
    setToggles((prev) => prev.map((t) => (t.key === key ? { ...t, on: !t.on } : t)));

  const syncNow = () => {
    setSyncing(true);
    toast.info(t("syncStarted"));
    window.setTimeout(() => {
      setSyncing(false);
      setSyncedNow(true);
      toast.success(t("syncCompleted"), { sub: t("peopleCount", { count: 1284 }) });
    }, 800);
  };

  return (
    <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto p-7">
      <div className="flex flex-col gap-4">
        <AdminCard
          title={t("domainsTitle")}
          action={<Pill label={t("verifiedCount", { count: DOMAINS.length })} tone="success" />}
        >
          <div className="flex flex-col gap-2.5">
            {DOMAINS.map((d) => (
              <div key={d.name} className="rounded-lg border border-(--border-app) p-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold">{d.name}</p>
                  <Pill label={t(`domainTags.${d.tag}`)} tone={d.ok ? "info" : "danger"} />
                </div>
                <p className="mt-1 text-[11px] text-(--text-muted)">
                  {d.id === "primary"
                    ? t("domainMeta.primary", { count: d.accountCount, registered: dateFormatter.format(new Date(Date.UTC(d.registered!.year, d.registered!.month - 1, 1))) })
                    : t(`domainMeta.${d.id}`, { count: d.accountCount })}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.checks.map((c) => (
                    <Pill key={c} label={c} tone="success" />
                  ))}
                  {d.failing?.map((c) => (
                    <Pill key={c} label={c} tone="danger" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title={t("sendLimitsTitle")}>
          <div className="flex flex-col gap-2">
            {SEND_LIMITS.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg border border-(--border-app) px-3 py-2 text-xs">
                <span className="text-(--text-muted)">{t(`sendLimits.${l.id}.name`)}</span>
                <span className="font-semibold">{t(`sendLimits.${l.id}.value`, { value: l.value })} ▾</span>
              </div>
            ))}
          </div>
        </AdminCard>
      </div>

      <div className="flex flex-col gap-4">
        <AdminCard title={t("mailPolicyTitle")}>
          <div className="flex flex-col gap-3">
            {toggles.map((policy) => (
              <div key={policy.key} className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(policy.key)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-xs font-semibold">{t(`toggles.${policy.key}.name`)}</p>
                  <p className="text-[11px] text-(--text-muted)">{t(`toggles.${policy.key}.desc`)}</p>
                </button>
                <AdminSwitch label={t(`toggles.${policy.key}.name`)} on={policy.on} onToggle={() => toggle(policy.key)} />
              </div>
            ))}
          </div>
        </AdminCard>

        <div className="rounded-xl p-4" style={{ backgroundColor: "#17181B" }}>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: "#2B4BF2" }}>
              AI
            </span>
            <h3 className="text-[13px] font-bold text-white">{t("aiTitle")}</h3>
          </div>
          <p className="text-[11.5px] leading-relaxed text-white/60">
            {t("aiDescription")}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {AI_ROLLOUT.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/6 px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-white">{t(`rollout.${r.id}`)}</p>
                  <p className="text-[10.5px] text-white/50">{t("peopleCount", { count: r.count })}</p>
                </div>
                <Pill label={t(`rolloutState.${r.state}`)} tone={r.tone} />
              </div>
            ))}
          </div>
        </div>

        <AdminCard className="bg-[#FBF9F4]! border-[#EBE4D6]!">
          <p className="text-xs leading-relaxed text-foreground">
            {t("syncSummary", { lastSync, count: 1284 })}
          </p>
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-[#DDD3B8] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : undefined} />
            {t(syncing ? "syncing" : "syncNow")}
          </button>
        </AdminCard>
      </div>
    </div>
  );
}
