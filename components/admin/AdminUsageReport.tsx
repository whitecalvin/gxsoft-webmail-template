"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AdminPageActions } from "./AdminShell";
import { AdminStorageUsage } from "./AdminStorageUsage";
import { Button } from "@/components/ui/Button";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { adminUsageReport, type AdminUsage } from "@/lib/tastemail/admin-management";

export function AdminUsageReport({ initialUsage, initialError }: { initialUsage?: AdminUsage; initialError?: string } = {}) {
  const t = useTranslations("adminUsage"), manage = useTranslations("adminManage"), fields = useTranslations("adminFields"), labels = useTranslations(), shared = useTranslations("mailboxesLive"), service = useTranslations("liveService"), format = useFormatter();
  const [usage, setUsage] = useState<AdminUsage | null>(initialUsage ?? null), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(initialError ?? null);
  useEffect(() => {
    if (revision === 0 && (initialUsage || initialError)) return;
    const controller = new AbortController(); let active = true;
    async function load() {
      setBusy(true); setError(null);
      try {
        const response = await fetch("/api/mail/admin/manage/reports", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw new Error(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" : "retryable");
        const result = adminUsageReport((await response.json()).usage); if (active) setUsage(result);
      } catch (error) { if (active) { setUsage(null); setError(error instanceof Error ? error.message : "retryable"); } }
      finally { if (active) setBusy(false); }
    }
    void load(); return () => { active = false; controller.abort(); };
  }, [revision, initialUsage, initialError]);
  return <section className="space-y-5" aria-busy={busy}>
    <AdminPageActions><Button disabled={busy} onClick={() => setRevision(value => value + 1)}>{manage("refresh")}</Button></AdminPageActions>
    {busy && <p role="status">{service("loading")}</p>}
    {error && <SystemErrorNotice message={service(["unauthorized", "forbidden", "rateLimited"].includes(error) ? error : "retryable")} />}
    {usage && <>
      <dl className="grid gap-3 sm:grid-cols-3">{[{ label: manage("domains"), value: usage.totalDomains }, { label: fields("users"), value: usage.totalUsers }, { label: fields("sharedMailboxes"), value: usage.totalSharedMailboxes }].map(item => <div key={item.label} className="rounded-sm border border-(--border-app) bg-background p-4"><dt className="text-xs text-(--text-muted)">{item.label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{format.number(item.value)}</dd></div>)}</dl>
      <div className="rounded-sm border border-(--border-app) bg-background p-4"><h2 className="mb-3 text-sm font-semibold">{shared("storage")}</h2><AdminStorageUsage name={shared("storage")} usedBytes={usage.usedBytes} quotaBytes={usage.quotaBytes} /></div>
      <p className="text-xs text-(--text-muted)">{t("limitNote")}</p>
      <section className="overflow-x-auto rounded-sm border border-(--border-app) bg-background"><h2 className="border-b border-(--border-app) p-4 text-sm font-semibold">{t("domainUsage")}</h2><table className="w-full min-w-120 text-left text-xs"><thead><tr>{[manage("domains"), fields("users"), fields("sharedMailboxes"), shared("storage")].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{usage.domains.map(row => <tr key={row.domainId} className="border-t border-(--border-app)"><td className="break-words p-3">{row.domain}</td><td className="p-3">{format.number(row.users)}</td><td className="p-3">{format.number(row.sharedMailboxes)}</td><td className="p-3"><AdminStorageUsage name={row.domain} usedBytes={row.usedBytes} quotaBytes={row.quotaBytes} /></td></tr>)}</tbody></table>{!usage.domains.length && <p className="p-4 text-sm">{manage("empty")}</p>}</section>
      <section className="overflow-x-auto rounded-sm border border-(--border-app) bg-background"><h2 className="border-b border-(--border-app) p-4 text-sm font-semibold">{t("topUsers")}</h2><table className="w-full min-w-120 text-left text-xs"><thead><tr>{[labels("auth.signup.name"), labels("auth.common.email"), t("accountType"), shared("storage")].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{usage.users.map(row => <tr key={row.userId} className="border-t border-(--border-app)"><td className="break-words p-3">{row.displayName}</td><td className="break-words p-3">{row.address}</td><td className="p-3">{row.shared ? manage("shared-mailboxes") : manage("users")}</td><td className="p-3"><AdminStorageUsage name={row.displayName} usedBytes={row.usedBytes} quotaBytes={row.quotaBytes} /></td></tr>)}</tbody></table>{!usage.users.length && <p className="p-4 text-sm">{manage("empty")}</p>}</section>
    </>}
  </section>;
}
