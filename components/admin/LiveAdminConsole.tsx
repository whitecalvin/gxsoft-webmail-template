"use client";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AdminPageActions, useAdminShell } from "./AdminShell";
import { Button } from "@/components/ui/Button";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { adminOverview } from "@/lib/tastemail/admin-contract";
import { AdminOperationsDetails } from "./AdminOperationsDetails";
export function LiveAdminConsole({ onRefresh }: { onRefresh?: () => void } = {}) {
  const { initial } = useAdminShell();
  const nav = useTranslations("adminNav"), dashboard = useTranslations("adminDashboard"), service = useTranslations("liveService"), manage = useTranslations("adminManage");
  const format = useFormatter();
  const [overview, setOverview] = useState(initial), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState<"unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | null>(null);
  useEffect(() => {
    if (revision === 0) return;
    const controller = new AbortController(); let active = true;
    async function load() {
      setBusy(true); setError(null);
      try {
        const response = await fetch("/api/mail/admin/operations", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) { if (active) setError(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" : "retryable"); return; }
        const data = adminOverview(await response.json()); if (active) setOverview(data);
      } catch { if (active) setError("retryable"); }
      finally { if (active) setBusy(false); }
    }
    void load(); return () => { active = false; controller.abort(); };
  }, [revision]);
  return <section className="space-y-5" aria-busy={busy}>
    <AdminPageActions><Button disabled={busy} onClick={onRefresh ?? (() => setRevision(n => n + 1))}>{manage("refresh")}</Button></AdminPageActions>
    {busy && <p role="status">{service("loading")}</p>}
    {error && <SystemErrorNotice message={service(error)} className="rounded-lg border border-(--border-app) bg-background p-4" />}
    {error !== "forbidden" && error !== "unauthorized" && <>
      <dl className="grid divide-y divide-(--border-app) overflow-hidden rounded-sm border border-(--border-app) bg-background sm:grid-cols-3 sm:divide-x sm:divide-y-0">{([{ key: "queueActive", title: dashboard("queueStats.pending") }, { key: "queueFailed", title: dashboard("queueStats.failed") }, { key: "quarantinePending", title: dashboard("authStatus.quarantine") }] as const).map(item => <div key={item.key} className="p-4"><dt className="text-xs text-(--text-muted)">{item.title}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{overview.metrics ? format.number(overview.metrics[item.key]) : "—"}</dd></div>)}</dl>
      <section aria-label={nav("systemStatus")} className="rounded-sm border border-(--border-app) bg-background"><h2 className="border-b border-(--border-app) px-4 py-3 text-xs font-semibold">{nav("systemStatus")}</h2><dl className="grid gap-4 p-4 text-xs sm:grid-cols-2"><div><dt className="mb-2 text-(--text-muted)">TASTEMAIL</dt><dd className="break-words">{overview.service.hostname} · {overview.service.version} · {overview.service.status}</dd></div><div><dt className="mb-2 text-(--text-muted)">PostgreSQL</dt><dd>{overview.database.status} · {overview.database.schemaStatus}</dd></div></dl><time className="block border-t border-(--border-app) px-4 py-2 text-[11px] text-(--text-muted)" dateTime={overview.observedAt}>{format.dateTime(new Date(overview.observedAt), { dateStyle: "medium", timeStyle: "short" })}</time></section>
      <AdminOperationsDetails overview={overview} />
    </>}
  </section>;
}
