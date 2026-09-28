"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useToast } from "@/context/toast-context";
import type { LiveQuarantineDetail, LiveQuarantinePage } from "@/lib/tastemail/quarantine";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type Cursor = { createdAt: string; id: string };
const ERRORS = new Set<LoadStatus>(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]);

async function responseData<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
    throw new Error(typeof reason === "string" ? reason : "retryable");
  }
  if (!payload || typeof payload !== "object") throw new Error("unavailable");
  return payload as T;
}

function errorStatus(error: unknown): LoadStatus {
  const reason = error instanceof Error ? error.message : "retryable";
  return ERRORS.has(reason as LoadStatus) ? reason as LoadStatus : "retryable";
}

export function LiveQuarantine() {
  const t = useTranslations("quarantinePage");
  const live = useTranslations("quarantineLive");
  const service = useTranslations("liveService");
  const locale = useLocale();
  const toast = useToast();
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [page, setPage] = useState<LiveQuarantinePage | null>(null);
  const [cursors, setCursors] = useState<Array<Cursor | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LiveQuarantineDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("loading");
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [confirmAction, setConfirmAction] = useState<"release" | "discard" | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const cursor = cursors[pageIndex];

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (cursor) { query.set("beforeCreatedAt", cursor.createdAt); query.set("beforeId", cursor.id); }
    fetch(`/api/mail/quarantine?${query}`, { cache: "no-store", signal: controller.signal })
      .then((response) => responseData<LiveQuarantinePage>(response))
      .then((value) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(value.items)) throw new Error("unavailable");
        setPage(value);
        setSelectedId(value.items[0]?.id ?? null);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPage(null);
        setSelectedId(null);
        setStatus(errorStatus(error));
      });
    return () => controller.abort();
  }, [cursor, attempt]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/mail/quarantine/${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => responseData<LiveQuarantineDetail>(response))
      .then((value) => {
        if (controller.signal.aborted) return;
        if (!value.item || typeof value.textBody !== "string") throw new Error("unavailable");
        setDetail(value);
        setDetailStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetail(null);
        setDetailStatus(errorStatus(error));
      });
    return () => controller.abort();
  }, [selectedId, detailAttempt]);

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const resolveSelected = async (action: "release" | "discard") => {
    if (!detail || actionBusy) return;
    const id = detail.item.id;
    setConfirmAction(null);
    setActionBusy(true);
    setActionNotice("");
    try {
      const response = await fetch(`/api/mail/quarantine/${encodeURIComponent(id)}/resolve`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }), signal: AbortSignal.timeout(30_000),
      });
      const payload: unknown = await response.json();
      const result = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
      if (!response.ok || result?.id !== id || result.status !== (action === "release" ? "released" : "discarded")) {
        throw new Error(typeof result?.status === "string" ? result.status : "mutation_uncertain");
      }
      toast.success(t(action === "release" ? "released" : "deleted"));
      setSelectedId(null);
      setDetail(null);
      setStatus("loading");
      setAttempt((value) => value + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "mutation_uncertain";
      setActionNotice(reason === "conflict" || reason === "not_found" ? live("itemChanged") :
        ["unauthorized", "forbidden", "rateLimited"].includes(reason) ? service(reason as "unauthorized" | "forbidden" | "rateLimited") :
        reason === "invalid_request" ? service("unavailable") : live("mutationUncertain"));
      if (!["unauthorized", "forbidden", "rateLimited", "invalid_request"].includes(reason)) {
        setStatus("loading");
        setAttempt((value) => value + 1);
      }
    } finally { setActionBusy(false); }
  };

  return <WorkspaceLayout title={t("title")} showGlobalSearch={false} className="flex min-h-0 flex-col">
    <section aria-label={t("listLabel")} className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-(--border-app) px-5 py-3 text-xs text-(--text-muted)">{live("readOnly")}</p>
      {actionNotice ? <p role="alert" className="border-b border-(--border-app) px-5 py-3 text-sm text-(--status-danger)">{actionNotice}</p> : null}
      {status === "loading" ? <p role="status" className="p-6 text-sm text-(--text-muted)">{service("loading")}</p> : null}
      {status !== "loading" && status !== "ready" ? <div role="alert" className="p-6 text-sm">
        <p>{service(status)}</p>
        <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }} className="mt-3 rounded-lg border border-(--border-app) px-3 py-2">{service("retry")}</button>
      </div> : null}
      {status === "ready" && page ? <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 overflow-y-auto border-r border-(--border-app) lg:w-100 lg:shrink-0">
          {page.items.length === 0 ? <p className="p-6 text-sm text-(--text-muted)">{live("empty")}</p> : null}
          {page.items.map((item) => <button key={item.id} type="button" aria-pressed={selectedId === item.id}
            onClick={() => { if (actionBusy) return; setSelectedId(item.id); setDetail(null); setDetailStatus("loading"); setActionNotice(""); }}
            className="w-full border-b border-(--border-app) px-5 py-4 text-left hover:bg-(--surface-muted) aria-pressed:bg-(--color-primary)/10">
            <span className="block truncate text-sm font-semibold">{item.subject || live("noSubject")}</span>
            <span className="mt-1 block truncate text-xs text-(--text-muted)">{item.envelopeSender || live("unknownSender")} · {dateFormat.format(new Date(item.createdAt))}</span>
          </button>)}
          {pageIndex > 0 || page.hasMore ? <div className="flex justify-between gap-3 p-4 text-sm">
            <button type="button" disabled={pageIndex === 0} onClick={() => { setPageIndex((value) => value - 1); setStatus("loading"); setDetail(null); }} className="disabled:opacity-40">{live("previous")}</button>
            <button type="button" disabled={!page.hasMore} onClick={() => {
              if (!page.nextBeforeCreatedAt || !page.nextBeforeId) return;
              setCursors((current) => [...current.slice(0, pageIndex + 1), { createdAt: page.nextBeforeCreatedAt!, id: page.nextBeforeId! }]);
              setPageIndex((value) => value + 1);
              setStatus("loading"); setDetail(null);
            }} className="disabled:opacity-40">{live("next")}</button>
          </div> : null}
        </div>
        <article className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5 lg:p-8">
          {selectedId && detailStatus === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p> : null}
          {selectedId && detailStatus !== "loading" && detailStatus !== "ready" ? <div role="alert" className="text-sm">
            <p>{service(detailStatus)}</p><button type="button" onClick={() => { setDetailStatus("loading"); setDetailAttempt((value) => value + 1); }} className="mt-3 rounded-lg border border-(--border-app) px-3 py-2">{service("retry")}</button>
          </div> : null}
          {selectedId && detailStatus === "ready" && detail ? <div className="mx-auto max-w-3xl">
            <h1 className="text-xl font-semibold wrap-break-word">{detail.item.subject || live("noSubject")}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={actionBusy} onClick={() => setConfirmAction("release")} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("release")}</button>
              <button type="button" disabled={actionBusy} onClick={() => setConfirmAction("discard")} className="rounded-(--radius-app) border border-(--status-danger) px-4 py-2 text-sm font-medium text-(--status-danger) disabled:opacity-50">{t("deletePermanently")}</button>
            </div>
            <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-[7rem_1fr]">
              <dt className="text-(--text-muted)">{live("sender")}</dt><dd className="break-all">{detail.item.envelopeSender || live("unknownSender")}</dd>
              <dt className="text-(--text-muted)">{live("recipient")}</dt><dd className="break-all">{detail.item.recipient}</dd>
              <dt className="text-(--text-muted)">{live("received")}</dt><dd>{dateFormat.format(new Date(detail.item.createdAt))}</dd>
              <dt className="text-(--text-muted)">{t("riskScore", { score: detail.item.spamScore })}</dt><dd>{detail.item.spamRules.join(", ") || "—"}</dd>
            </dl>
            <section aria-label={t("safePreviewHeading")} className="mt-6 rounded-xl border border-(--border-app) bg-background p-5">
              <h2 className="mb-3 font-semibold">{t("safePreviewHeading")}</h2>
              <p className="whitespace-pre-wrap wrap-break-word text-sm">{detail.textBody || t("noPreview")}</p>
            </section>
          </div> : null}
          {!selectedId ? <p className="text-sm text-(--text-muted)">{t("selectPrompt")}</p> : null}
        </article>
      </div> : null}
    </section>
    {confirmAction && detail ? <ConfirmDialog
      tone={confirmAction === "discard" ? "destructive" : "warning"}
      title={confirmAction === "discard" ? t("deleteTitle") : t("release")}
      description={confirmAction === "discard" ? t("deleteDescription", { subject: detail.item.subject || live("noSubject") }) : live("releaseConfirm", { subject: detail.item.subject || live("noSubject") })}
      confirmLabel={t(confirmAction === "discard" ? "deletePermanently" : "release")}
      confirmDisabled={actionBusy}
      onCancel={() => setConfirmAction(null)}
      onConfirm={() => void resolveSelected(confirmAction)}
    /> : null}
  </WorkspaceLayout>;
}
