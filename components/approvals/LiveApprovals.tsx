"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { ChevronLeft } from "lucide-react";
import { useMobilePane } from "@/components/layout/useMobilePane";
import { clientApprovalFailure, clientMailFailure } from "@/lib/tastemail/client-session-status";
import type { LiveApproval } from "@/lib/tastemail/approvals";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type View = "all" | "mine" | "pending" | "approved" | "rejected" | "cancelled";
const VIEWS: View[] = ["all", "mine", "pending", "approved", "rejected", "cancelled"];
const ERRORS = new Set<LoadStatus>(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]);
const MUTATION_ERRORS = new Set([...ERRORS, "invalid_request", "not_found", "conflict"]);

function mutationFailureReason(error: unknown): string {
  return error instanceof Error && MUTATION_ERRORS.has(error.message) ? error.message : "retryable";
}

export function LiveApprovals() {
  const t = useTranslations("approvalsPage");
  const live = useTranslations("approvalsLive");
  const service = useTranslations("liveService");
  const locale = useLocale();
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [items, setItems] = useState<LiveApproval[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<{ id: string; title: string; action: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertainId, setUncertainId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createUncertain, setCreateUncertain] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftApprovers, setDraftApprovers] = useState("");
  const mutationBusyRef = useRef(false);
  const createUncertainRef = useRef(false);
  const uncertainIdRef = useRef<string | null>(null);
  const approvalRevision = useRef(0);
  const confirmedDecisionIds = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    const startedAtRevision = approvalRevision.current;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]);
    fetch("/api/mail/approvals", { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) throw new Error("unavailable");
        return payload.items as LiveApproval[];
      })
      .then((approvals) => {
        if (controller.signal.aborted) return;
        if (mutationBusyRef.current) return;
        if (startedAtRevision !== approvalRevision.current) {
          setAttempt((value) => value + 1);
          return;
        }
        confirmedDecisionIds.current.clear();
        const uncertain = approvals.find((item) => item.id === uncertainIdRef.current);
        if (uncertain && (uncertain.state !== "pending" || !uncertain.isMyTurn)) {
          uncertainIdRef.current = null;
          setUncertainId(null);
          setNotice(live("changed"));
        }
        setItems(approvals);
        setSelectedId((previous) => approvals.some((item) => item.id === previous) ? previous : approvals[0]?.id ?? null);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (mutationBusyRef.current) return;
        if (startedAtRevision !== approvalRevision.current) {
          setAttempt((value) => value + 1);
          return;
        }
        const reason = error instanceof Error ? error.message : "retryable";
        setItems([]);
        setSelectedId(null);
        setStatus(ERRORS.has(reason as LoadStatus) ? reason as LoadStatus : "retryable");
      });
    return () => controller.abort();
  }, [attempt, live]);

  const visible = items.filter((item) => view === "all" || view === "mine" && item.isMyTurn || item.state === view);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  useMobilePane(mobileDetail && !!selected, () => { setMobileDetail(false); setPendingDecision(null); });
  const uncertainItem = status === "ready" ? items.find((item) => item.id === uncertainId) : null;
  const uncertainResolved = !!uncertainItem && (uncertainItem.state !== "pending" || !uncertainItem.isMyTurn);
  const unresolvedUncertainId = uncertainResolved ? null : uncertainId;
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const formatDate = (value: string) => dateFormat.format(new Date(value));

  const createApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationBusyRef.current || createUncertainRef.current || createBusy || createUncertain) return;
    const approverUsernames = draftApprovers.split(/[,;\s]+/u).map((value) => value.trim()).filter(Boolean);
    if (!draftTitle.trim() || [...draftTitle.trim()].length > 200 || [...draftDescription.trim()].length > 4_000 ||
        approverUsernames.length < 1 || approverUsernames.length > 20 ||
        new Set(approverUsernames.map((value) => value.toLowerCase())).size !== approverUsernames.length) {
      setNotice(live("createInvalid"));
      return;
    }
    mutationBusyRef.current = true;
    approvalRevision.current += 1;
    setCreateBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/mail/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ title: draftTitle.trim(), description: draftDescription.trim(), approverUsernames }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(clientApprovalFailure(response.status, payload));
      }
      const approval = payload && typeof payload === "object" && "approval" in payload ? payload.approval : null;
      if (!approval || typeof approval !== "object" || !("id" in approval) || typeof approval.id !== "string" || !approval.id) {
        throw new Error("unavailable");
      }
      setSelectedId(approval.id);
      setView("all");
      setCreating(false);
      setDraftTitle("");
      setDraftDescription("");
      setDraftApprovers("");
      setNotice(live("createSuccess"));
      setStatus("loading");
    } catch (error) {
      const reason = mutationFailureReason(error);
      if (reason === "retryable" || reason === "unavailable") {
        createUncertainRef.current = true;
        setCreateUncertain(true);
        setNotice(live("createUncertain"));
      } else {
        setNotice(reason === "invalid_request" ? live("createInvalid") :
          ERRORS.has(reason as LoadStatus) ? service(reason as LoadStatus) : service("unavailable"));
      }
    } finally {
      approvalRevision.current += 1;
      mutationBusyRef.current = false;
      setCreateBusy(false);
      setAttempt((value) => value + 1);
    }
  };

  const requestDecision = (action: "approve" | "reject") => {
    if (!selected || !selected.isMyTurn || selected.state !== "pending" || mutationBusyRef.current || busy || createBusy || unresolvedUncertainId) return;
    if (action === "reject" && !comment.trim()) { setNotice(live("commentRequired")); return; }
    setPendingDecision({ id: selected.id, title: selected.title, action });
  };

  const decide = async (action: "approve" | "reject", expectedId = selected?.id) => {
    if (!selected || !selected.isMyTurn || selected.state !== "pending" || mutationBusyRef.current ||
        expectedId !== selected.id || uncertainIdRef.current || confirmedDecisionIds.current.has(selected.id) || busy || unresolvedUncertainId === selected.id) return;
    if (action === "reject" && !comment.trim()) {
      setNotice(live("commentRequired"));
      return;
    }
    mutationBusyRef.current = true;
    approvalRevision.current += 1;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/mail/approvals/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ action, comment: comment.trim() }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(clientApprovalFailure(response.status, payload));
      const approval = payload && typeof payload === "object" && "approval" in payload ? payload.approval : null;
      if (!approval || typeof approval !== "object" || !("id" in approval) || approval.id !== selected.id ||
          !("isMyTurn" in approval) || approval.isMyTurn !== false || !("state" in approval) ||
          !["pending", "approved", "rejected", "cancelled"].includes(String(approval.state))) {
        throw new Error("unavailable");
      }
      confirmedDecisionIds.current.add(selected.id);
      setItems((previous) => previous.map((item) => item.id === selected.id ? { ...item, isMyTurn: false } : item));
      setComment("");
      setNotice(t(action === "approve" ? "approvedToast" : "rejectedToast"));
    } catch (error) {
      const reason = mutationFailureReason(error);
      if (reason === "retryable" || reason === "unavailable") {
        uncertainIdRef.current = selected.id;
        setUncertainId(selected.id);
        setNotice(live("uncertain"));
      } else if (reason === "forbidden" || reason === "not_found" || reason === "conflict") {
        setNotice(live("changed"));
      } else {
        setNotice(reason === "invalid_request" ? live("commentRequired") :
          ERRORS.has(reason as LoadStatus) ? service(reason as LoadStatus) : service("unavailable"));
      }
    } finally {
      approvalRevision.current += 1;
      mutationBusyRef.current = false;
      setBusy(false);
      setAttempt((value) => value + 1);
    }
  };

  return (
    <WorkspaceLayout title={t("title")} showGlobalSearch={false} className="flex min-h-0 flex-col">
      {pendingDecision ? <ConfirmDialog
        tone={pendingDecision.action === "reject" ? "destructive" : "default"}
        title={t(pendingDecision.action === "approve" ? "approveQuestion" : "rejectQuestion")}
        description={pendingDecision.title}
        confirmLabel={t(pendingDecision.action)}
        confirmDisabled={busy || createBusy || selected?.id !== pendingDecision.id || !selected?.isMyTurn || selected?.state !== "pending" || !!unresolvedUncertainId}
        onCancel={() => setPendingDecision(null)}
        onConfirm={() => { const decision = pendingDecision; setPendingDecision(null); void decide(decision.action, decision.id); }}
      /> : null}
      <section aria-label={t("documentList")} className="flex min-h-0 flex-1 flex-col">
        <div className="workspace-page-header justify-between gap-2 border-b border-(--border-app) px-4">
          <h1 className="font-semibold">{t("documentList")}</h1>
          <button type="button" disabled={busy || createBusy} onClick={() => { if (mutationBusyRef.current) return; setCreating((value) => !value); setNotice(""); }} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white disabled:opacity-50">{live("createAction")}</button>
        </div>
        {creating ? <form onSubmit={createApproval} className="grid gap-3 border-b border-(--border-app) bg-(--surface-muted) p-4 md:grid-cols-2">
          <label className="text-sm md:col-span-2">{live("createTitle")}
            <input disabled={busy || createBusy || createUncertain} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} required maxLength={200} className="mt-1 block w-full rounded-(--radius-app) border border-(--border-app) bg-background p-2" />
          </label>
          <label className="text-sm">{live("createDescription")}
            <textarea disabled={busy || createBusy || createUncertain} value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={4000} rows={3} className="mt-1 block w-full rounded-(--radius-app) border border-(--border-app) bg-background p-2" />
          </label>
          <label className="text-sm">{live("createApprovers")}
            <textarea disabled={busy || createBusy || createUncertain} value={draftApprovers} onChange={(event) => setDraftApprovers(event.target.value)} required rows={3} placeholder={live("approversHint")} className="mt-1 block w-full rounded-(--radius-app) border border-(--border-app) bg-background p-2" />
          </label>
          <p className="text-xs text-(--text-muted) md:col-span-2">{live("createNotice")}</p>
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={busy || createBusy || createUncertain} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white disabled:opacity-50">{live("createSubmit")}</button>
            {createUncertain ? <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }} className="rounded-(--radius-app) border border-(--border-app) px-4 py-2 text-sm">{live("reloadList")}</button> : null}
          </div>
        </form> : null}
        {notice ? <div role="status" className="flex flex-wrap items-center gap-3 border-b border-(--border-app) px-5 py-3 text-sm">
          <span>{uncertainResolved ? live("changed") : notice}</span>
          {unresolvedUncertainId ? <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }} className="rounded-lg border border-(--border-app) px-3 py-1.5">{live("reloadList")}</button> : null}
        </div> : null}
        <nav aria-label={t("approvalStatus")} className="flex shrink-0 gap-2 overflow-x-auto border-b border-(--border-app) px-4 py-3">
          {VIEWS.map((value) => <button key={value} type="button" aria-current={view === value ? "page" : undefined}
            onClick={() => { setView(value); setSelectedId(null); setMobileDetail(false); setComment(""); }}
            className={`min-h-11 shrink-0 rounded-lg px-3 py-2 text-sm ${view === value ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)" : "text-(--text-muted) hover:bg-(--surface-muted)"}`}>
            {live(value)} <span className="ml-1 tabular-nums text-xs">{items.filter((item) => value === "all" || value === "mine" && item.isMyTurn || item.state === value).length}</span>
          </button>)}
        </nav>
        {status === "loading" ? <p role="status" className="p-6 text-sm text-(--text-muted)">{service("loading")}</p> : null}
        {status !== "loading" && status !== "ready" ? <SystemErrorNotice message={service(status)} actionLabel={service("retry")} onAction={() => { setStatus("loading"); setAttempt((value) => value + 1); }} /> : null}
        {status === "ready" ? <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className={`${mobileDetail && selected ? "hidden lg:block" : ""} min-h-0 flex-1 overflow-y-auto border-(--border-app) lg:flex-none lg:border-r lg:w-100 lg:shrink-0`}>
            {visible.length === 0 ? <p className="p-6 text-sm text-(--text-muted)">{t("emptyStatus")}</p> : null}
            {visible.map((item) => <button key={item.id} type="button" aria-pressed={selected?.id === item.id}
              onClick={() => { setSelectedId(item.id); setMobileDetail(true); setComment(""); }} className="w-full border-b border-(--border-app) px-5 py-4 text-left hover:bg-(--surface-muted) aria-pressed:bg-(--color-primary)/10">
              <span className="block truncate text-sm font-semibold">{item.title}</span>
              <span className="mt-1 block truncate text-xs text-(--text-muted)">{item.requesterUsername} · {live(item.state)} · {formatDate(item.createdAt)}</span>
            </button>)}
          </div>
          <article className={`${mobileDetail && selected ? "" : "hidden lg:block"} min-h-0 min-w-0 flex-1 overflow-y-auto p-5 lg:p-8`}>
            <button type="button" disabled={busy} onClick={() => setMobileDetail(false)} className="mb-4 flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-(--color-primary-ink) disabled:opacity-50 lg:hidden"><ChevronLeft size={18} aria-hidden="true" />{t("backToList")}</button>
            {selected ? <div className="mx-auto max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 text-xl font-semibold wrap-break-word">{selected.title}</h1>
                <span className="rounded-full bg-(--color-primary)/10 px-2 py-1 text-xs">{live(selected.state)}</span>
                {selected.isMyTurn ? <span className="rounded-full bg-(--status-warning-bg) px-2 py-1 text-xs text-(--status-warning)">{live("mine")}</span> : null}
              </div>
              <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-[7rem_1fr]">
                <dt className="text-(--text-muted)">{live("requester")}</dt><dd className="break-all">{selected.requesterUsername}</dd>
                <dt className="text-(--text-muted)">{live("created")}</dt><dd>{formatDate(selected.createdAt)}</dd>
              </dl>
              <section aria-label={live("description")} className="mt-6 rounded-xl border border-(--border-app) bg-background p-5">
                <h2 className="mb-3 font-semibold">{live("description")}</h2>
                <p className="whitespace-pre-wrap text-sm">{selected.description || live("noDescription")}</p>
              </section>
              <section aria-label={t("approvalChain")} className="mt-6 rounded-xl border border-(--border-app) bg-background p-5">
                <h2 className="mb-3 font-semibold">{t("approvalChain")}</h2>
                <ol className="divide-y divide-(--border-app)">{selected.steps.map((step) => <li key={step.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{step.position}. {step.approverUsername}</span><span className="text-(--text-muted)">{live(step.state)}</span></div>
                  {step.actedAt ? <p className="mt-1 text-xs text-(--text-muted)">{formatDate(step.actedAt)}</p> : null}
                  {step.comment ? <p className="mt-2 whitespace-pre-wrap text-sm">{step.comment}</p> : null}
                </li>)}</ol>
              </section>
              {selected.isMyTurn && selected.state === "pending" && unresolvedUncertainId !== selected.id ? <section aria-label={t("approvalComment")} className="sticky bottom-0 mt-6 space-y-3 rounded-xl border border-(--border-app) bg-background p-4 shadow-lg lg:static lg:p-5 lg:shadow-none">
                <label className="block text-sm"><span>{t("approvalComment")}</span>
                  <textarea disabled={busy || createBusy || !!unresolvedUncertainId} value={comment} onChange={(event) => { setComment(event.target.value); if (!uncertainId) setNotice(""); }} maxLength={1000} rows={3} className="mt-2 w-full rounded-(--radius-app) border border-(--border-app) bg-background p-3" />
                </label>
                <div className="flex gap-2">
                  <button type="button" disabled={busy || createBusy || !!unresolvedUncertainId} onClick={() => requestDecision("approve")} className="min-h-11 flex-1 rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white disabled:opacity-50">{t("approve")}</button>
                  <button type="button" disabled={busy || createBusy || !!unresolvedUncertainId} onClick={() => requestDecision("reject")} className="min-h-11 flex-1 rounded-(--radius-app) border border-(--border-app) px-4 py-2 text-sm text-(--status-danger) disabled:opacity-50">{t("reject")}</button>
                </div>
              </section> : null}
            </div> : <p className="text-sm text-(--text-muted)">{t("selectPrompt")}</p>}
          </article>
        </div> : null}
      </section>
    </WorkspaceLayout>
  );
}
