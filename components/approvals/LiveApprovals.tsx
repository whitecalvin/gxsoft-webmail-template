"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import type { LiveApproval } from "@/lib/tastemail/approvals";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type View = "all" | "mine" | "pending" | "approved" | "rejected" | "cancelled";
const VIEWS: View[] = ["all", "mine", "pending", "approved", "rejected", "cancelled"];
const ERRORS = new Set<LoadStatus>(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]);

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

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/approvals", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof reason === "string" ? reason : "retryable");
        }
        if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) throw new Error("unavailable");
        return payload.items as LiveApproval[];
      })
      .then((approvals) => {
        if (controller.signal.aborted) return;
        setItems(approvals);
        setSelectedId((previous) => approvals.some((item) => item.id === previous) ? previous : approvals[0]?.id ?? null);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setItems([]);
        setSelectedId(null);
        setStatus(ERRORS.has(reason as LoadStatus) ? reason as LoadStatus : "retryable");
      });
    return () => controller.abort();
  }, [attempt]);

  const visible = items.filter((item) => view === "all" || view === "mine" && item.isMyTurn || item.state === view);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const formatDate = (value: string) => dateFormat.format(new Date(value));

  const createApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createBusy || createUncertain) return;
    const approverUsernames = draftApprovers.split(/[,;\s]+/u).map((value) => value.trim()).filter(Boolean);
    if (!draftTitle.trim() || [...draftTitle.trim()].length > 200 || [...draftDescription.trim()].length > 4_000 ||
        approverUsernames.length < 1 || approverUsernames.length > 20 ||
        new Set(approverUsernames.map((value) => value.toLowerCase())).size !== approverUsernames.length) {
      setNotice(live("createInvalid"));
      return;
    }
    setCreateBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/mail/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: draftTitle.trim(), description: draftDescription.trim(), approverUsernames }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" ? reason : "retryable");
      }
      const approval = payload && typeof payload === "object" && "approval" in payload ? payload.approval : null;
      if (!approval || typeof approval !== "object" || !("id" in approval) || typeof approval.id !== "string") {
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
      setAttempt((value) => value + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      if (reason === "retryable" || reason === "unavailable") {
        setCreateUncertain(true);
        setNotice(live("createUncertain"));
      } else {
        setNotice(reason === "invalid_request" ? live("createInvalid") :
          ERRORS.has(reason as LoadStatus) ? service(reason as LoadStatus) : service("unavailable"));
      }
    } finally {
      setCreateBusy(false);
    }
  };

  const decide = async (action: "approve" | "reject") => {
    if (!selected || !selected.isMyTurn || selected.state !== "pending" || busy || uncertainId === selected.id) return;
    if (action === "reject" && !comment.trim()) {
      setNotice(live("commentRequired"));
      return;
    }
    if (!window.confirm(`${t(action === "approve" ? "approveQuestion" : "rejectQuestion")} ${selected.title}`)) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/mail/approvals/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, comment: comment.trim() }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json();
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" ? reason : "retryable");
      }
      setComment("");
      setNotice(t(action === "approve" ? "approvedToast" : "rejectedToast"));
      setStatus("loading");
      setAttempt((value) => value + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      if (reason === "retryable" || reason === "unavailable") {
        setUncertainId(selected.id);
        setNotice(live("uncertain"));
      } else if (reason === "forbidden" || reason === "not_found") {
        setNotice(live("changed"));
      } else {
        setNotice(reason === "invalid_request" ? live("commentRequired") :
          ERRORS.has(reason as LoadStatus) ? service(reason as LoadStatus) : service("unavailable"));
      }
      setStatus("loading");
      setAttempt((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspaceLayout title={t("title")} showGlobalSearch={false} className="flex min-h-0 flex-col">
      <section aria-label={t("documentList")} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--border-app) px-4 py-3">
          <h1 className="font-semibold">{t("documentList")}</h1>
          <button type="button" onClick={() => { setCreating((value) => !value); setNotice(""); }} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white">{live("createAction")}</button>
        </div>
        {creating ? <form onSubmit={createApproval} className="grid gap-3 border-b border-(--border-app) bg-(--surface-muted) p-4 md:grid-cols-2">
          <label className="text-sm md:col-span-2">{live("createTitle")}
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} required maxLength={200} className="mt-1 block w-full rounded-(--radius-app) border border-(--border-app) bg-background p-2" />
          </label>
          <label className="text-sm">{live("createDescription")}
            <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={4000} rows={3} className="mt-1 block w-full rounded-(--radius-app) border border-(--border-app) bg-background p-2" />
          </label>
          <label className="text-sm">{live("createApprovers")}
            <textarea value={draftApprovers} onChange={(event) => setDraftApprovers(event.target.value)} required rows={3} placeholder={live("approversHint")} className="mt-1 block w-full rounded-(--radius-app) border border-(--border-app) bg-background p-2" />
          </label>
          <p className="text-xs text-(--text-muted) md:col-span-2">{live("createNotice")}</p>
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={createBusy || createUncertain} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white disabled:opacity-50">{live("createSubmit")}</button>
            {createUncertain ? <button type="button" onClick={() => { setCreateUncertain(false); setStatus("loading"); setAttempt((value) => value + 1); }} className="rounded-(--radius-app) border border-(--border-app) px-4 py-2 text-sm">{service("retry")}</button> : null}
          </div>
        </form> : null}
        {notice ? <div role="status" className="flex flex-wrap items-center gap-3 border-b border-(--border-app) px-5 py-3 text-sm">
          <span>{notice}</span>
          {uncertainId ? <button type="button" onClick={() => { setUncertainId(null); setStatus("loading"); setAttempt((value) => value + 1); }} className="rounded-lg border border-(--border-app) px-3 py-1.5">{service("retry")}</button> : null}
        </div> : null}
        <nav aria-label={t("approvalStatus")} className="flex shrink-0 gap-2 overflow-x-auto border-b border-(--border-app) px-4 py-3">
          {VIEWS.map((value) => <button key={value} type="button" aria-current={view === value ? "page" : undefined}
            onClick={() => { setView(value); setSelectedId(null); setComment(""); }}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm ${view === value ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)" : "text-(--text-muted) hover:bg-(--surface-muted)"}`}>
            {live(value)}
          </button>)}
        </nav>
        {status === "loading" ? <p role="status" className="p-6 text-sm text-(--text-muted)">{service("loading")}</p> : null}
        {status !== "loading" && status !== "ready" ? <div role="alert" className="p-6 text-sm">
          <p>{service(status)}</p>
          <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }} className="mt-3 rounded-lg border border-(--border-app) px-3 py-2">{service("retry")}</button>
        </div> : null}
        {status === "ready" ? <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 overflow-y-auto border-r border-(--border-app) lg:w-100 lg:shrink-0">
            {visible.length === 0 ? <p className="p-6 text-sm text-(--text-muted)">{t("emptyStatus")}</p> : null}
            {visible.map((item) => <button key={item.id} type="button" aria-pressed={selected?.id === item.id}
              onClick={() => { setSelectedId(item.id); setComment(""); }} className="w-full border-b border-(--border-app) px-5 py-4 text-left hover:bg-(--surface-muted) aria-pressed:bg-(--color-primary)/10">
              <span className="block truncate text-sm font-semibold">{item.title}</span>
              <span className="mt-1 block truncate text-xs text-(--text-muted)">{item.requesterUsername} · {live(item.state)} · {formatDate(item.createdAt)}</span>
            </button>)}
          </div>
          <article className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5 lg:p-8">
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
              {selected.isMyTurn && selected.state === "pending" && uncertainId !== selected.id ? <section aria-label={t("approvalComment")} className="mt-6 space-y-3 rounded-xl border border-(--border-app) bg-background p-5">
                <label className="block text-sm"><span>{t("approvalComment")}</span>
                  <textarea value={comment} onChange={(event) => { setComment(event.target.value); if (!uncertainId) setNotice(""); }} maxLength={1000} rows={3} className="mt-2 w-full rounded-(--radius-app) border border-(--border-app) bg-background p-3" />
                </label>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => decide("approve")} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white disabled:opacity-50">{t("approve")}</button>
                  <button type="button" disabled={busy} onClick={() => decide("reject")} className="rounded-(--radius-app) border border-(--border-app) px-4 py-2 text-sm text-(--status-danger) disabled:opacity-50">{t("reject")}</button>
                </div>
              </section> : null}
            </div> : <p className="text-sm text-(--text-muted)">{t("selectPrompt")}</p>}
          </article>
        </div> : null}
      </section>
    </WorkspaceLayout>
  );
}
