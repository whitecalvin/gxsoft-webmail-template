"use client";

// Admin Console > API & Webhooks tab: API key management, webhook delivery
// status, usage graph, and OAuth-connected third-party apps.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { API_KEYS, API_USAGE, CONNECTED_APPS, WEBHOOKS } from "@/lib/mock-admin";
import { AdminCard, Pill, Sparkline } from "../primitives";
import { useToast } from "@/context/toast-context";
import type { Tone } from "@/types/admin";

const API_BARS = Array.from({ length: 30 }, (_, i) => 30 + Math.round(Math.abs(Math.sin(i / 3)) * 60));

interface ApiKeyRow {
  nameId: string;
  owner: string;
  key: string;
  scopes: string[];
  usedId: string;
  usedCount: number;
  stateId: string;
  tone: Tone;
  stale?: boolean;
}

export function ApiTab() {
  const t = useTranslations("adminApi");
  const locale = useLocale();
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[]>(API_KEYS);
  const [apps, setApps] = useState(CONNECTED_APPS);
  const numberFormatter = new Intl.NumberFormat(locale);
  const compactFormatter = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const percentFormatter = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const usageValue = (id: string, value: number) => id === "calls" ? compactFormatter.format(value) : id === "errorRate" ? percentFormatter.format(value) : t("milliseconds", { count: numberFormatter.format(value) });

  const issueKey = () => {
    const suffix = Math.random().toString(16).slice(2, 6);
    setKeys((prev) => [
      { nameId: "newKey", owner: "self", key: `mw_live_${suffix}…${suffix}`, scopes: ["mail.read"], usedId: "never", usedCount: 0, stateId: "active", tone: "success" },
      ...prev,
    ]);
    toast.success(t("keyIssued"), { sub: `mw_live_${suffix}…${suffix}` });
  };

  const rotateStaleKey = () => {
    setKeys((prev) =>
      prev.map((k) => (k.stale ? { ...k, usedId: "justNow", usedCount: 0, stateId: "active", tone: "success", stale: false } : k))
    );
    toast.success(t("keyRotated"), { sub: t("keyNames.legacyErp") });
  };

  const disconnectApp = (name: string) => {
    setApps((prev) => prev.filter((a) => a.name !== name));
    toast.success(t("appDisconnected"), { sub: name });
  };

  return (
    <div className="grid flex-1 grid-cols-[1.3fr_1fr] gap-4 overflow-y-auto p-7">
      <div className="flex flex-col gap-4">
        <AdminCard
          title={t("keysTitle")}
          action={
            <button
              type="button"
              onClick={issueKey}
              className="text-[11px] font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              {t("issueKey")}
            </button>
          }
        >
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_70px_54px] gap-2 text-[10px] font-bold uppercase text-(--text-muted)">
              <span>{t("columns.name")}</span>
              <span>{t("columns.key")}</span>
              <span>{t("columns.scopes")}</span>
              <span>{t("columns.lastUsed")}</span>
              <span>{t("columns.status")}</span>
            </div>
            {keys.map((k) => (
              <div key={k.key} className="grid grid-cols-[1fr_1fr_1fr_70px_54px] items-center gap-2 border-t border-(--border-app) pt-2 text-[11px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t(`keyNames.${k.nameId}`)}</p>
                  <p className="truncate text-[10px] text-(--text-muted)">{k.owner === "self" ? t("self") : k.owner}</p>
                </div>
                <span className="truncate font-mono text-[10.5px] text-(--text-muted)">{k.key}</span>
                <div className="flex flex-wrap gap-1">
                  {k.scopes.map((s) => (
                    <span key={s} className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[9.5px] dark:bg-white/10">
                      {s}
                    </span>
                  ))}
                </div>
                <span className="text-(--text-muted)">{t(`lastUsed.${k.usedId}`, { count: k.usedCount })}</span>
                <Pill label={t(`keyStates.${k.stateId}`)} tone={k.tone} />
              </div>
            ))}
          </div>

          {keys.some((k) => k.stale) && (
            <div className="mt-3 rounded-lg border border-[#F0DAD6] bg-[#FFFBFA] px-3 py-2 text-[11px] text-[#8E3B33]">
              {t("staleKeyWarning", { name: t("keyNames.legacyErp"), days: 90 })}{" "}
              <button type="button" onClick={rotateStaleKey} className="font-bold underline">
                {t("rotateNow")}
              </button>
            </div>
          )}
        </AdminCard>

        <AdminCard title={t("webhooksTitle")}>
          <div className="flex flex-col gap-2">
            {WEBHOOKS.map((w) => (
              <div key={w.url} className="flex items-center gap-2 border-t border-(--border-app) pt-2 text-xs first:border-t-0 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px]">{w.url}</p>
                  <p className="text-[10.5px] text-(--text-muted)">{w.event}</p>
                </div>
                <span className="shrink-0 text-[11px] text-(--text-muted)">{percentFormatter.format(w.rate)}</span>
                <Pill label={t(`webhookStates.${w.stateId}`)} tone={w.tone} />
              </div>
            ))}
          </div>
        </AdminCard>
      </div>

      <div className="flex flex-col gap-4">
        <AdminCard title={t("usageTitle")}>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            {API_USAGE.map((u) => (
              <div key={u.id}>
                <p className="text-sm font-bold">{usageValue(u.id, u.value)}</p>
                <p className="text-[10px] text-(--text-muted)">{t(`usage.${u.id}`)}</p>
              </div>
            ))}
          </div>
          <Sparkline bars={API_BARS} height={50} />
          <p className="mt-2 text-[10.5px] text-(--text-muted)">{t("rateLimit", { count: compactFormatter.format(5000000) })}</p>
        </AdminCard>

        <AdminCard title={t("approvedAppsTitle")}>
          {apps.length === 0 ? (
            <p className="text-xs text-(--text-muted)">{t("noApps")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {apps.map((a) => (
                <div key={a.name} className="rounded-lg border border-(--border-app) p-2.5">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    {a.icon}
                  </span>
                  <p className="mt-1.5 text-xs font-semibold">{a.name}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10.5px] text-(--text-muted)">{t("appUsers", { count: numberFormatter.format(a.users) })}</p>
                    <button
                      type="button"
                      onClick={() => disconnectApp(a.name)}
                      className="text-[10.5px] font-semibold text-[#C0433B]"
                    >
                      {t("disconnect")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
