"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useToast } from "@/context/toast-context";
import { SettingsHeaderTitle } from "./SettingsHeaderTitle";
import { SettingsNav } from "./SettingsNav";
import type { LiveSecuritySnapshot } from "@/lib/tastemail/security";

type LoadStatus = "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type LoadState = { attempt: number; status: LoadStatus; snapshot: LiveSecuritySnapshot | null };

export function LiveSecurity() {
  const t = useTranslations("securityPage");
  const live = useTranslations("securityLive");
  const service = useTranslations("liveService");
  const locale = useLocale();
  const toast = useToast();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | "others" | null>(null);
  const [revoking, setRevoking] = useState(false);
  const mutationLock = useRef(false);
  const current = state?.attempt === attempt ? state : null;
  const snapshot = current?.snapshot;
  const otherSessions = snapshot?.sessions.filter((session) => !session.current) ?? [];
  const selectedSession = revokeTarget && revokeTarget !== "others"
    ? otherSessions.find((session) => session.id === revokeTarget) : null;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/security", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const failure = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof failure === "string" ? failure : "retryable");
        }
        if (!payload || typeof payload !== "object" || !("mfa" in payload) ||
          !("sessions" in payload) || !Array.isArray(payload.sessions) ||
          !("events" in payload) || !Array.isArray(payload.events)) throw new Error("unavailable");
        return payload as LiveSecuritySnapshot;
      })
      .then((result) => { if (!controller.signal.aborted) setState({ attempt, status: "ready", snapshot: result }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const status: LoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as LoadStatus : "retryable";
        setState({ attempt, status, snapshot: null });
      });
    return () => controller.abort();
  }, [attempt]);

  const dateTime = (value: string) => Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : value;

  async function confirmRevocation() {
    if (!revokeTarget || mutationLock.current) return;
    const target = revokeTarget;
    if (target !== "others" && !otherSessions.some((session) => session.id === target)) return;
    mutationLock.current = true;
    setRevoking(true);
    setRevokeTarget(null);
    try {
      const response = await fetch("/api/mail/security/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(target === "others" ? { scope: "others" } : { sessionId: target }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !("status" in payload) || payload.status !== "revoked") {
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" ? reason : "retryable");
      }
      toast.success(target === "others" ? t("logoutAllSuccess") : t("sessionRevoked"));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      toast.error(reason === "notFound" || reason === "conflict" ? live("sessionChanged") :
        ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? service(reason as LoadStatus) : service("retryable"));
    } finally {
      setAttempt((value) => value + 1);
      mutationLock.current = false;
      setRevoking(false);
    }
  }

  return <WorkspaceLayout title={<SettingsHeaderTitle title={t("title")} />} titleAsHeading={false} showGlobalSearch={false} className="flex min-h-0 flex-col bg-(--surface-muted) lg:flex-row">
    <SettingsNav active="security" />
    <section aria-label={t("title")} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-5 sm:p-8">
        <h1 className="sr-only">{t("title")}</h1>
        <p role="note" className="rounded-(--radius-app) border border-(--border-app) bg-background px-4 py-3 text-sm text-(--text-muted)">{live("readOnly")}</p>
        {!current ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p>
          : current.status !== "ready" ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
            <p>{service(current.status)}</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-(--color-primary)">{service("retry")}</button>
          </div> : snapshot ? <>
            <section aria-labelledby="live-security-mfa" className="rounded-(--radius-app) border border-(--border-app) bg-background p-5">
              <h2 id="live-security-mfa" className="text-sm font-bold">{t("mfaHeading")}</h2>
              <p className="mt-3 text-sm">{snapshot.mfa.totpEnabled ? live("totpEnabled") : live("totpDisabled")}</p>
              {snapshot.mfa.totpEnabled ? <p className="mt-1 text-xs text-(--text-muted)">{live("recoveryRemaining", { count: snapshot.mfa.recoveryCodesRemaining })}</p> : null}
            </section>
            <section aria-labelledby="live-security-sessions" className="rounded-(--radius-app) border border-(--border-app) bg-background p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="live-security-sessions" className="text-sm font-bold">{t("sessionsHeading")}</h2>
                {otherSessions.length > 0 ? <button type="button" disabled={revoking} onClick={() => setRevokeTarget("others")}
                  className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-xs font-semibold text-(--status-danger) disabled:opacity-50">
                  {live("revokeOthers")}
                </button> : null}
              </div>
              {snapshot.sessions.length === 0 ? <p className="mt-3 text-sm text-(--text-muted)">{live("noSessions")}</p> :
                <ul className="mt-3 divide-y divide-(--border-app)">
                  {snapshot.sessions.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words text-sm font-semibold">{session.userAgent || live("unknownDevice")}</p>
                        {session.current ? <span className="rounded-full bg-(--color-primary)/10 px-2 py-0.5 text-xs text-(--color-primary-ink)">{t("badges.currentDevice")}</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-(--text-muted)"><time dateTime={session.lastUsedAt}>{dateTime(session.lastUsedAt)}</time>{session.remoteAddress ? ` · ${session.remoteAddress}` : ""}</p>
                    </div>
                    {!session.current ? <button type="button" disabled={revoking} onClick={() => setRevokeTarget(session.id)}
                      className="shrink-0 rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-xs font-semibold text-(--status-danger) disabled:opacity-50">{t("logout")}</button> : null}
                  </li>)}
                </ul>}
            </section>
            <section aria-labelledby="live-security-events" className="rounded-(--radius-app) border border-(--border-app) bg-background p-5">
              <h2 id="live-security-events" className="text-sm font-bold">{t("recentActivity")}</h2>
              {snapshot.events.length === 0 ? <p className="mt-3 text-sm text-(--text-muted)">{live("noEvents")}</p> :
                <ul className="mt-3 divide-y divide-(--border-app)">
                  {snapshot.events.map((event) => <li key={event.id} className="py-3 first:pt-0 last:pb-0">
                    <code className="break-all text-xs">{event.eventType}</code>
                    <p className="mt-1 text-xs text-(--text-muted)"><time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>{event.remoteAddress ? ` · ${event.remoteAddress}` : ""}</p>
                  </li>)}
                </ul>}
            </section>
          </> : null}
      </div>
    </section>
    {revokeTarget ? <ConfirmDialog tone="destructive"
      title={revokeTarget === "others" ? t("logoutAllTitle") : live("revokeOneTitle")}
      description={revokeTarget === "others" ? t("logoutAllDescription") : live("revokeOneDescription", { device: selectedSession?.userAgent || live("unknownDevice") })}
      confirmLabel={revokeTarget === "others" ? live("revokeOthers") : t("logout")}
      confirmDisabled={revoking || (revokeTarget !== "others" && !selectedSession)}
      onCancel={() => setRevokeTarget(null)} onConfirm={() => { void confirmRevocation(); }} /> : null}
  </WorkspaceLayout>;
}
