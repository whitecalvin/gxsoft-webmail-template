"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { linkedId, type LinkedAccount } from "@/lib/linked-accounts";
import { linkedSyncJobsReceipt, type LinkedSyncJobs } from "@/lib/linked-sync-jobs";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useLinkedAccounts } from "@/context/linked-accounts-context";
import type { LinkedSyncJob } from "@/lib/linked-sync-jobs";

export async function linkedJobsRead(account: LinkedAccount, signal: AbortSignal): Promise<LinkedSyncJobs> {
  if (!linkedId(account.id)) throw new Error("invalid_request");
  const response = await fetch(`/api/mail/linked-accounts/${account.id}/sync/jobs`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) });
  const reader = response.body?.getReader();
  if (!reader) throw new Error(clientMailFailure(response.status, null));
  const decoder = new TextDecoder("utf-8", { fatal: true }); let raw = "", size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 256 * 1024) throw new Error("unavailable"); raw += decoder.decode(value, { stream: true }); }
    raw += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new Error(clientMailFailure(response.status, null)); }
  if (!response.ok) {
    const status = body && typeof body === "object" && "status" in body ? body.status : null;
    throw new Error(["not_found", "not_deployed", "conflict", "invalid_request"].includes(String(status)) ? String(status) : clientMailFailure(response.status, body));
  }
  if (response.status !== 200 || signal.aborted) throw new Error("unavailable");
  return linkedSyncJobsReceipt(body, account);
}

export function LinkedSyncJobsPanel({ account }: { account: LinkedAccount }) {
  const t = useTranslations("linkedSyncJobs"), service = useTranslations("liveService"), linked = useTranslations("linkedAccounts");
  const [attempt, setAttempt] = useState(0);
  const operations = useTranslations("linkedOperations");
  const { busy, uncertain, controlJob } = useLinkedAccounts();
  const [control, setControl] = useState<LinkedSyncJob | null>(null);
  const [result, setResult] = useState<{ account: LinkedAccount; attempt: number; data?: LinkedSyncJobs; error?: string } | null>(null);
  const current = result?.account === account && result.attempt === attempt ? result : null;
  useEffect(() => {
    const controller = new AbortController();
    void linkedJobsRead(account, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ account, attempt, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ account, attempt, error: error instanceof Error ? error.message : "unavailable" });
    });
    return () => controller.abort();
  }, [account, attempt]);
  const failure = (status: string) => ["not_found", "not_deployed", "conflict", "invalid_request"].includes(status) ? linked(status) : service(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(status) ? status : "unavailable");
  return <section aria-label={t("title")} className="min-w-0 border-t border-(--border-app) pt-3">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{t("title")}</h3><Button size="sm" disabled={!current} onClick={() => setAttempt(value => value + 1)}>{service("retry")}</Button></div>
    <p className="mt-1 text-xs text-(--text-muted)">{t("scope")}</p>
    <div className="mt-2 max-h-40 overflow-y-auto">
      {!current ? <p role="status" className="text-sm">{t("loading")}</p> : current.error ? <p role="alert" className="text-sm text-(--status-danger)">{failure(current.error)}</p> : !current.data?.jobs.length ? <p className="text-sm text-(--text-muted)">{t("empty")}</p> : <ul className="divide-y divide-(--border-app)">{current.data.jobs.map(job => <li key={job.folder} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
      <span className="min-w-0 flex-1 break-words">{job.label}</span><span className="text-xs text-(--text-muted)">{t(job.status)} · {t("attempts", { count: job.attempts })}</span>
      <Button size="sm" disabled={busy || uncertain || job.controlRevision === null || job.controlRevision >= Number.MAX_SAFE_INTEGER || job.status === "paused" && !account.capabilities.sync} onClick={() => setControl(job)}>{operations(job.status === "paused" ? "resume" : "pause")}</Button>
      {job.lastError ? <p className="w-full text-xs text-(--status-danger)">{job.lastError === "userPaused" ? operations("userPaused") : t(job.lastError)}</p> : null}
    </li>)}</ul>}
    </div>
    {control ? <ConfirmDialog tone="warning" title={operations(control.status === "paused" ? "resume" : "pause")} description={operations("controlConfirm", { folder: control.label })} confirmDisabled={busy || uncertain} onCancel={() => setControl(null)} onConfirm={() => {
      const target = control; setControl(null);
      if (target.controlRevision !== null) void controlJob(account.id, target.folder, target.controlRevision, target.status !== "paused").then(ok => { if (ok) setAttempt(value => value + 1); });
    }} confirmLabel={operations(control.status === "paused" ? "resume" : "pause")} /> : null}
  </section>;
}
