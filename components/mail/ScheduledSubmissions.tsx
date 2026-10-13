"use client";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";
import { clientMutationFailure } from "@/lib/tastemail/client-session-status";
import type { LiveScheduledSubmission } from "@/lib/tastemail/mail";

const LOAD_TIMEOUT_MS = 25_000;

function failureStatus(payload: unknown): string {
  return payload && typeof payload === "object" && "status" in payload && typeof payload.status === "string"
    ? payload.status : "retryable";
}

export function ScheduledSubmissions({ accountId, className = "" }: { accountId?: string; className?: string }) {
  const locale = useLocale();
  const t = useTranslations("scheduledSubmissions");
  const service = useTranslations("liveService");
  const toast = useToast();
  const { scheduledRevision, refreshScheduledSubmissions } = useMail();
  const [items, setItems] = useState<LiveScheduledSubmission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const cancelingRef = useRef(false);
  const loadingRef = useRef(false);
  const cancellationRevision = useRef(0);
  const uncertainCancelIds = useRef(new Set<string>());
  const [uncertainIds, setUncertainIds] = useState<string[]>([]);

  useEffect(() => {
    loadingRef.current = true;
    const startedAtRevision = cancellationRevision.current;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(LOAD_TIMEOUT_MS)]);
    const query = accountId ? `?${new URLSearchParams({ accountId })}` : "";
    void fetch(`/api/mail/submissions${query}`, { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(failureStatus(payload));
        if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items) ||
            !payload.items.every((item: unknown) => item && typeof item === "object" &&
              "id" in item && typeof item.id === "string" &&
              "sendAt" in item && typeof item.sendAt === "string" && Number.isFinite(Date.parse(item.sendAt)) &&
              "recipients" in item && Array.isArray(item.recipients) &&
              item.recipients.every((recipient: unknown) => typeof recipient === "string"))) {
          throw new Error("unavailable");
        }
        return payload.items as LiveScheduledSubmission[];
      })
      .then((loaded) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== cancellationRevision.current) { refreshScheduledSubmissions(); return; }
        for (const id of uncertainCancelIds.current) {
          if (!loaded.some((item) => item.id === id)) uncertainCancelIds.current.delete(id);
        }
        setUncertainIds([...uncertainCancelIds.current]);
        setItems(loaded);
        setError(uncertainCancelIds.current.size > 0 ? "mutation_uncertain" : null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          if (startedAtRevision !== cancellationRevision.current) { refreshScheduledSubmissions(); return; }
          const status = reason instanceof Error ? reason.message : "retryable";
          if (status === "unauthorized" || status === "forbidden") setItems([]);
          setError(status);
        }
      })
      .finally(() => { if (!controller.signal.aborted) loadingRef.current = false; });
    return () => { controller.abort(); loadingRef.current = false; };
  }, [accountId, scheduledRevision, refreshScheduledSubmissions]);

  useEffect(() => {
    if ((items.length === 0 && uncertainIds.length === 0) || error === "unauthorized" || error === "forbidden") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    function scheduleRefresh() {
      clearTimeout(timer);
      if (disposed || document.visibilityState !== "visible") return;
      const nextSendAt = Math.min(...items.map((item) => Date.parse(item.sendAt)));
      // Overdue entries remain pending until the server confirms their removal.
      const delay = Math.min(30_000, Math.max(5_000, nextSendAt - Date.now() + 500));
      timer = setTimeout(() => {
        if (disposed || document.visibilityState !== "visible") return;
        if (!cancelingRef.current && !loadingRef.current) refreshScheduledSubmissions();
        scheduleRefresh();
      }, delay);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !cancelingRef.current && !loadingRef.current) refreshScheduledSubmissions();
      scheduleRefresh();
    }
    scheduleRefresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [items, uncertainIds, error, refreshScheduledSubmissions]);

  const cancel = async (id: string) => {
    if (cancelingRef.current || uncertainCancelIds.current.has(id)) return;
    cancelingRef.current = true;
    setCancelingId(id);
    setError(null);
    try {
      const response = await fetch("/api/mail/submissions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId: id, ...(accountId ? { accountId } : {}) }),
        signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 409 && failureStatus(payload) === "cannot_cancel") throw new Error("cannot_cancel");
        throw new Error(clientMutationFailure(response.status, payload));
      }
      if (failureStatus(payload) !== "canceled") throw new Error("mutation_uncertain");
      setItems((current) => current.filter((item) => item.id !== id));
      toast.success(t("canceled"));
      refreshScheduledSubmissions();
    } catch (reason) {
      const status = reason instanceof Error ? reason.message : "retryable";
      if (!["cannot_cancel", "unauthorized", "forbidden", "rateLimited", "invalid_request"].includes(status)) {
        uncertainCancelIds.current.add(id);
        setUncertainIds([...uncertainCancelIds.current]);
        setError("mutation_uncertain");
      } else {
        setError(status === "invalid_request" ? "unavailable" : status);
      }
      refreshScheduledSubmissions();
    } finally {
      cancellationRevision.current += 1;
      cancelingRef.current = false;
      setCancelingId(null);
    }
  };

  if (items.length === 0 && !error) return null;
  const knownError = error && ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(error);
  const errorNotice = error ? <SystemErrorNotice message={error === "mutation_uncertain" ? service("mutationUncertain") : knownError ? service(error as "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable") : t("cannotCancel")} actionLabel={service("retry")} onAction={refreshScheduledSubmissions} /> : null;
  if (!items.length) return errorNotice;
  return <section aria-label={t("title")} className={className}>
    <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-(--text-muted)">{t("title")}{items.length ? ` · ${items.length}` : ""}</h2>
    {errorNotice}
    <ul className="space-y-2">
      {items.map((item) => <li key={item.id} className="rounded-(--radius-app) border border-(--border-app) bg-background p-2 text-xs">
        <p className="truncate font-medium" title={item.recipients.join(", ")}>{item.recipients[0] ?? "—"}{item.recipients.length > 1 ? ` +${item.recipients.length - 1}` : ""}</p>
        <p className="mt-0.5 text-(--text-muted)">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.sendAt))}</p>
        <button type="button" disabled={cancelingId !== null || uncertainIds.includes(item.id)} onClick={() => void cancel(item.id)} className="mt-1 font-semibold text-(--status-danger) disabled:opacity-50">
          {cancelingId === item.id ? t("canceling") : t("cancel")}
        </button>
      </li>)}
    </ul>
  </section>;
}
