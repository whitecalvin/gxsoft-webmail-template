"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Mail, X } from "lucide-react";
import { useLinkedAccounts } from "@/context/linked-accounts-context";
import type { LinkedAccount } from "@/lib/linked-accounts";
import type { LinkedFolderList } from "@/lib/linked-folders";
import type { LinkedAllQueueReceipt } from "@/lib/linked-sync-all";
import type { LinkedOperationReceipt } from "@/lib/linked-operations";
import { linkedMailQuery, requireLinkedMailPage, requireLinkedMailDetail, type LinkedMailPage, type LinkedMailDetail, type LinkedCachedMail } from "@/lib/linked-mail";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import { Modal } from "@/components/overlay/Modal";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { LinkedHtmlMessageBody } from "./LinkedHtmlMessageBody";
import { LinkedAttachmentDownload } from "./LinkedAttachmentDownload";
import { LinkedSyncJobsPanel } from "./LinkedSyncJobsPanel";

export async function linkedCachedRead(id: string, folder: string, signal: AbortSignal, selection?: LinkedCachedMail, beforeUid?: number): Promise<LinkedMailPage | LinkedMailDetail> {
  const query = new URLSearchParams({ folder });
  if (selection) query.set("uidValidity", String(selection.uidValidity));
  else if (beforeUid !== undefined) query.set("beforeUid", String(beforeUid));
  if (!linkedMailQuery(id, query, selection ? String(selection.uid) : undefined)) throw new Error("invalid_request");
  const response = await fetch(`/api/mail/linked-accounts/${id}/messages${selection ? `/${selection.uid}` : ""}?${query}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) });
  const body: unknown = await response.json();
  if (!response.ok) {
    const status = body && typeof body === "object" && "status" in body ? body.status : null;
    throw new Error(["not_found", "not_deployed", "conflict", "auth_unavailable", "invalid_request"].includes(String(status)) ? String(status) : clientMailFailure(response.status, body));
  }
  if (response.status !== 200) throw new Error("unavailable");
  return selection ? requireLinkedMailDetail(body, { linkedAccountId: id, folder, uid: selection.uid, uidValidity: selection.uidValidity }) : requireLinkedMailPage(body, id, { folder, beforeUid });
}

function CachedAccountView({ account }: { account: LinkedAccount }) {
  const t = useTranslations("linkedMail"), service = useTranslations("liveService"), auth = useTranslations("linkedAccountAuth"), linked = useTranslations("linkedAccounts");
  const { busy, uncertain, error, loadFolders, syncFolder, queueFolder, queueAll, operationReceipt, operationLocator, recoverOperation, resumePartial } = useLinkedAccounts();
  const operations = useTranslations("linkedOperations");
  const [folders, setFolders] = useState<LinkedFolderList | null>(null), [folder, setFolder] = useState("");
  const [confirm, setConfirm] = useState(false), [page, setPage] = useState<LinkedMailPage | null>(null), [selected, setSelected] = useState<LinkedCachedMail | null>(null), [detail, setDetail] = useState<LinkedMailDetail | null>(null);
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]), [attempt, setAttempt] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null), [detailError, setDetailError] = useState<string | null>(null);
  const [syncConfirm, setSyncConfirm] = useState(false), [syncResult, setSyncResult] = useState<{ folder: string; count: number; complete: boolean } | null>(null);
  const [showJobs, setShowJobs] = useState(false);
  const jobs = useTranslations("linkedSyncJobs");
  const queue = useTranslations("linkedSyncQueue");
  const [queueConfirm, setQueueConfirm] = useState(false), [queuedFolder, setQueuedFolder] = useState<string | null>(null), [jobsRefresh, setJobsRefresh] = useState(0);
  const allQueue = useTranslations("linkedSyncAll");
  const [allQueueConfirm, setAllQueueConfirm] = useState(false), [allQueueResult, setAllQueueResult] = useState<LinkedAllQueueReceipt | null>(null);
  const [resumeConfirm, setResumeConfirm] = useState(false);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const cursor = cursors[cursors.length - 1];
  const failure = (value: string) => ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(value) ? service(value) : value === "auth_unavailable" ? auth(value) : ["not_found", "not_deployed", "conflict", "limit", "invalid_request", "mutation_uncertain"].includes(value) ? linked(value) : service("unavailable");
  useEffect(() => {
    if (!folder || busy || uncertain) return;
    const controller = new AbortController();
    void linkedCachedRead(account.id, folder, controller.signal, undefined, cursor).then(value => {
      if (!controller.signal.aborted) setPage(value as LinkedMailPage);
    }).catch(e => { if (!controller.signal.aborted) setPageError(e instanceof Error ? e.message : "unavailable"); });
    return () => controller.abort();
  }, [account.id, folder, cursor, attempt, busy, uncertain]);
  useEffect(() => {
    if (!selected || !folder || busy || uncertain) return;
    const controller = new AbortController();
    void linkedCachedRead(account.id, folder, controller.signal, selected).then(value => {
      if (!controller.signal.aborted) setDetail(value as LinkedMailDetail);
    }).catch(e => { if (!controller.signal.aborted) setDetailError(e instanceof Error ? e.message : "unavailable"); });
    return () => controller.abort();
  }, [account.id, folder, selected, attempt, busy, uncertain]);
  const reset = () => { setPage(null); setPageError(null); setSelected(null); setDetail(null); setDetailError(null); };
  function adoptRecoveredOperation(receipt: LinkedOperationReceipt | null) {
    if (!active.current || !receipt || receipt.linkedAccountId !== account.id || receipt.revision !== account.revision || receipt.credentialGeneration !== account.credentialGeneration) return;
    if (receipt.listed) setFolders({ linkedAccountId: account.id, revision: receipt.revision, credentialGeneration: receipt.credentialGeneration, encoding: "imapModifiedUtf7", folders: receipt.folders });
    if (receipt.sync) {
      const result = receipt.sync;
      reset(); setFolders({ linkedAccountId: account.id, revision: receipt.revision, credentialGeneration: receipt.credentialGeneration, encoding: "imapModifiedUtf7", folders: receipt.folders });
      setCursors([undefined]); setFolder(result.folder); setSyncResult({ folder: result.folder, count: result.messages, complete: result.cycleComplete }); setAttempt(value => value + 1);
    }
    if (["queue", "queueAll", "resumePartial"].includes(receipt.action) && ["confirmed", "partial"].includes(receipt.phase)) {
      setAllQueueResult({ linkedAccountId: account.id, revision: receipt.revision, credentialGeneration: receipt.credentialGeneration, status: receipt.phase === "confirmed" ? "queued" : "partial", mode: "receiveMirror", folders: receipt.folders.slice(0, receipt.confirmedPrefix), uncertain: receipt.phase === "partial" });
    }
    if (receipt.action !== "list") { setShowJobs(true); setJobsRefresh(value => value + 1); }
  }
  const locked = busy || uncertain;
  return <>
    <div className="shrink-0 space-y-3 border-b border-(--border-app) p-4">
      <p className="text-xs text-(--text-muted)">{t("scope")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={locked || !account.capabilities.sync} onClick={() => setConfirm(true)}>{t("folders")}</Button>
        <Button size="sm" disabled={busy} aria-expanded={showJobs} onClick={() => setShowJobs(value => !value)}>{jobs("title")}</Button>
        <Button size="sm" disabled={locked || !account.capabilities.sync} onClick={() => setAllQueueConfirm(true)}>{allQueue("schedule")}</Button>
        {folders ? <CustomSelect aria-label={t("folder")} value={folder} disabled={locked} onChange={e => { reset(); setCursors([undefined]); setFolder(e.target.value); }} className="app-control min-w-0 flex-1 rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm">
          <option value="">{t("choose")}</option>{folders.folders.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </CustomSelect> : null}
        {folder ? <Button size="sm" disabled={locked} onClick={() => { reset(); setAttempt(a => a + 1); }}>{service("retry")}</Button> : null}
        {folder ? <Button size="sm" disabled={locked || !account.capabilities.sync} onClick={() => setSyncConfirm(true)}>{t("sync")}</Button> : null}
        {folder ? <Button size="sm" disabled={locked || !account.capabilities.sync} onClick={() => setQueueConfirm(true)}>{queue("schedule")}</Button> : null}
      </div>
      {!folders ? <p className="text-sm text-(--text-muted)">{t("chooseHint")}</p> : !folders.folders.length ? <p>{t("noFolders")}</p> : null}
      {error ? <p role="alert" className="text-sm text-(--status-danger)">{failure(error)}</p> : null}
      {operationLocator?.linkedAccountId === account.id ? <div className="space-y-2 text-sm" role="status">
        <p>{operations("recoveryHint")}</p>
        {operationReceipt ? <p>{operations(operationReceipt.phase)}</p> : null}
        <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => { void recoverOperation().then(adoptRecoveredOperation); }}>{operations("recover")}</Button>
          {operationReceipt?.canResumePartial ? <Button size="sm" disabled={busy} onClick={() => setResumeConfirm(true)}>{operations("resumePartial")}</Button> : null}</div>
      </div> : null}
      {syncResult?.folder === folder ? <p role="status" className="text-sm text-(--text-muted)">{t("synced", { count: syncResult.count })} {t(syncResult.complete ? "scanComplete" : "scanMore")}</p> : null}
      {queuedFolder === folder ? <p role="status" className="text-sm text-(--text-muted)">{queue("accepted")}</p> : null}
      {allQueueResult ? <div role={allQueueResult.status === "partial" ? "alert" : "status"} className="space-y-2 text-sm">
        <p>{allQueue(allQueueResult.status === "partial" ? "partial" : "accepted", { count: allQueueResult.folders.length })}</p>
        {allQueueResult.folders.length ? <ul className="max-h-32 overflow-y-auto break-words text-xs text-(--text-muted)">{allQueueResult.folders.map(entry => <li key={entry.value}>{entry.label}</li>)}</ul> : null}
      </div> : null}
      {showJobs ? <LinkedSyncJobsPanel key={jobsRefresh} account={account} /> : null}
      {resumeConfirm ? <ConfirmDialog tone="warning" title={operations("resumePartial")} description={operations("partialConfirm")} confirmDisabled={busy} onCancel={() => setResumeConfirm(false)} onConfirm={() => { setResumeConfirm(false); void resumePartial().then(adoptRecoveredOperation); }} confirmLabel={operations("resumePartial")} /> : null}
    </div>
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(220px,1fr)_2fr]">
      <section aria-label={t("messages")} className={`${selected ? "hidden md:flex" : "flex"} min-h-0 flex-col md:border-r md:border-(--border-app)`}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {pageError ? <p role="alert" className="p-4 text-sm text-(--status-danger)">{failure(pageError)}</p> : folder && !page ? <p role="status" className="p-4 text-sm">{t("loading")}</p> : null}
          {page && !page.messages.length ? <p className="p-4 text-sm text-(--text-muted)">{t("empty")}</p> : null}
          {page?.messages.map(m => <button key={`${m.uidValidity}:${m.uid}`} type="button" aria-pressed={selected?.uid === m.uid && selected.uidValidity === m.uidValidity} disabled={locked} className={`block w-full border-b border-(--border-app) px-4 py-3 text-left hover:bg-(--surface-muted) ${selected?.uid === m.uid ? "bg-(--surface-muted)" : ""}`} onClick={() => { setDetail(null); setDetailError(null); setSelected(m); }}>
            <span className="block truncate text-sm font-medium">{m.subject || t("noSubject")}</span><span className="block truncate text-xs text-(--text-muted)">{m.sender}</span>
          </button>)}
        </div>
        {folder ? <footer className="flex shrink-0 justify-between gap-2 border-t border-(--border-app) p-3">
          <Button size="sm" disabled={locked || cursors.length === 1} onClick={() => { reset(); setCursors(c => c.slice(0, -1)); }}>{t("previous")}</Button>
          <Button size="sm" disabled={locked || !page?.nextBeforeUid} onClick={() => { const next = page?.nextBeforeUid; if (next) { reset(); setCursors(c => [...c, next]); } }}>{t("next")}</Button>
        </footer> : null}
      </section>
      <section aria-label={t("body")} className={`${selected ? "block" : "hidden md:block"} min-h-0 min-w-0 overflow-y-auto p-4`}>
        {selected ? <><Button variant="ghost" size="sm" leadingIcon={<ArrowLeft size={16} />} onClick={() => { setSelected(null); setDetail(null); }} className="mb-3 md:hidden">{t("messages")}</Button>
          <h3 className="break-words text-lg font-semibold">{selected.subject || t("noSubject")}</h3><p className="break-all text-sm text-(--text-muted)">{selected.sender}</p>
          {detailError ? <p role="alert" className="mt-4 text-sm text-(--status-danger)">{failure(detailError)}</p> : !detail ? <p role="status" className="mt-4 text-sm">{t("loading")}</p> : detail.body.htmlBody ? <LinkedHtmlMessageBody key={`${account.id}:${folder}:${selected.uidValidity}:${selected.uid}`} detail={detail} subject={selected.subject} sender={selected.sender} /> : <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm">{detail.body.textBody}</pre>}
          {detail?.attachments.length ? <div className="mt-4 border-t border-(--border-app) pt-3"><p className="text-xs text-(--text-muted)">{t("attachments")}</p><ul className="mt-2 space-y-1">{detail.attachments.map(a => <li key={a.index}><LinkedAttachmentDownload key={`${detail.linkedAccountId}:${detail.folder}:${detail.uidValidity}:${detail.uid}:${a.index}`} identity={detail} attachment={a} disabled={locked} failure={failure} /></li>)}</ul></div> : null}
        </> : <p className="text-sm text-(--text-muted)">{t("selectMessage")}</p>}
      </section>
    </div>
    {confirm ? <ConfirmDialog tone="default" title={t("folders")} description={t("folderConfirm", { email: account.email })} confirmLabel={t("folders")} confirmDisabled={locked} onCancel={() => setConfirm(false)} onConfirm={async () => {
      setConfirm(false); reset(); setFolder(""); setFolders(null); setCursors([undefined]);
      const result = await loadFolders(account.id);
      if (active.current && result) setFolders(result);
    }} /> : null}
    {syncConfirm ? <ConfirmDialog tone="default" title={t("sync")} description={t("syncConfirm", { email: account.email, folder: folders?.folders.find(f => f.value === folder)?.label ?? folder })} confirmLabel={t("sync")} confirmDisabled={locked || !folder || !account.capabilities.sync} onCancel={() => setSyncConfirm(false)} onConfirm={async () => {
      setSyncConfirm(false); reset(); setSyncResult(null);
      const result = await syncFolder(account.id, folder);
      if (active.current && result) { setSyncResult({ folder: result.folder, count: result.messages, complete: result.cycleComplete }); setCursors([undefined]); setAttempt(a => a + 1); }
    }} /> : null}
    {queueConfirm ? <ConfirmDialog tone="warning" title={queue("schedule")} description={queue("confirm", { email: account.email, folder: folders?.folders.find(entry => entry.value === folder)?.label ?? folder })} confirmLabel={queue("schedule")} confirmDisabled={locked || !folder || !account.capabilities.sync} onCancel={() => setQueueConfirm(false)} onConfirm={async () => {
      setQueueConfirm(false); setQueuedFolder(null);
      const accepted = await queueFolder(account.id, folder);
      if (active.current && accepted) { setQueuedFolder(folder); setJobsRefresh(value => value + 1); setShowJobs(true); }
    }} /> : null}
    {allQueueConfirm ? <ConfirmDialog tone="warning" title={allQueue("schedule")} description={allQueue("confirm", { email: account.email })} confirmLabel={allQueue("schedule")} confirmDisabled={locked || !account.capabilities.sync} onCancel={() => setAllQueueConfirm(false)} onConfirm={async () => {
      setAllQueueConfirm(false); setAllQueueResult(null); setQueuedFolder(null);
      const receipt = await queueAll(account.id);
      if (active.current && receipt) { setAllQueueResult(receipt); setJobsRefresh(value => value + 1); setShowJobs(true); }
    }} /> : null}
  </>;
}

export function LinkedMailViewer({ initialId, onClose }: { initialId: string; onClose: () => void }) {
  const t = useTranslations("linkedMail"), common = useTranslations("common");
  const { snapshot, busy, uncertain } = useLinkedAccounts();
  const [id, setId] = useState(initialId);
  const accounts = snapshot.status === "ready" ? snapshot.data.accounts.filter(a => a.capabilities.read) : [];
  const account = accounts.find(a => a.id === id);
  return <Modal ariaLabel={t("open")} onClose={onClose} maxWidth={1200} className="flex h-[min(800px,calc(100dvh-2rem))] flex-col">
    <header className="flex shrink-0 items-center gap-3 border-b border-(--border-app) p-4">
      <Mail size={20} aria-hidden="true" /><h2 className="text-base font-semibold">{t("open")}</h2>
      <Tooltip content={common("close")} className="ml-auto shrink-0"><Button variant="ghost" size="icon" aria-label={common("close")} onClick={onClose}><X size={18} /></Button></Tooltip>
    </header>
    <div className="shrink-0 p-4"><CustomSelect aria-label={t("account")} value={id} disabled={busy || uncertain} onChange={e => setId(e.target.value)} className="app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm">{accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}</CustomSelect></div>
    {account ? <CachedAccountView key={`${account.id}:${account.revision}:${account.credentialGeneration}`} account={account} /> : <p role="alert" className="p-4 text-sm text-(--status-danger)">{t("unavailable")}</p>}
  </Modal>;
}
