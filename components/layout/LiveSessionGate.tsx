"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { clientSessionFailure } from "@/lib/tastemail/client-session-status";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

type SessionState = "checking" | "ready" | "unauthorized" | "retryable" | "unavailable" | "forbidden" | "rateLimited";
const SESSION_CHECK_TIMEOUT_MS = 20_000;
const SESSION_RECHECK_INTERVAL_MS = 60_000;

// Presentation guard only. Each /api/mail route still validates the server-side session.
export function LiveSessionGate({ children, sessionUsername, sessionAccountId }: { children: ReactNode; sessionUsername: string | null; sessionAccountId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("liveService");
  const [attempt, setAttempt] = useState(0);
  // The parent server layout already verified this session before rendering us.
  const [state, setState] = useState<SessionState>("ready");
  const lastCheckAt = useRef(0);
  const lastPathname = useRef(pathname);

  useEffect(() => {
    const initialServerVerifiedPath = attempt === 0 && lastPathname.current === pathname;
    lastPathname.current = pathname;
    if (initialServerVerifiedPath) {
      lastCheckAt.current = Date.now();
      return;
    }
    lastCheckAt.current = Date.now();
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS)]);
    fetch("/api/mail/session", { cache: "no-store", signal })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setState("unauthorized");
          router.replace("/login?reason=session-ended");
          return;
        }
        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => null);
          if (controller.signal.aborted) return;
          setState(clientSessionFailure(response.status, payload));
          return;
        }
        const payload: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (payload && typeof payload === "object" && "authenticated" in payload && payload.authenticated === true) {
          const username = "username" in payload ? payload.username : null;
          const accountId = "accountId" in payload ? payload.accountId : null;
          if (typeof username !== "string" || !sessionUsername || username.trim().toLowerCase() !== sessionUsername.trim().toLowerCase() ||
            typeof accountId !== "string" || !sessionAccountId || accountId !== sessionAccountId) {
            setState("checking");
            window.location.reload();
            return;
          }
          setState("ready");
        } else {
          setState("unavailable");
        }
      })
      .catch(() => { if (!controller.signal.aborted) setState("retryable"); });
    return () => controller.abort();
  }, [attempt, pathname, router, sessionUsername, sessionAccountId]);

  useEffect(() => {
    if (state !== "ready") return;
    const recheckAfterInactivity = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheckAt.current < SESSION_RECHECK_INTERVAL_MS) return;
      lastCheckAt.current = Date.now();
      setAttempt((value) => value + 1);
    };
    const interval = window.setInterval(recheckAfterInactivity, SESSION_RECHECK_INTERVAL_MS);
    recheckAfterInactivity();
    window.addEventListener("focus", recheckAfterInactivity);
    document.addEventListener("visibilitychange", recheckAfterInactivity);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", recheckAfterInactivity);
      document.removeEventListener("visibilitychange", recheckAfterInactivity);
    };
  }, [state]);

  // Navigation and periodic rechecks stay in the background. Only an actual
  // authorization or service failure replaces the inherited workspace shell.
  if (state === "ready") return <>{children}</>;
  if (state === "retryable" || state === "unavailable") return <>{children}<SystemErrorNotice message={t(state)} actionLabel={t("retry")} onAction={() => setAttempt(value => value + 1)} /></>;
  const displayState = state;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-5 text-center text-sm text-(--text-muted)">
      {displayState === "checking" || displayState === "unauthorized" ? <p role="status">
        {t(displayState === "checking" ? "loading" : displayState)}
      </p> : null}
      {displayState !== "checking" && displayState !== "unauthorized" ? (
        <SystemErrorNotice message={t(displayState)} actionLabel={t("retry")} onAction={() => { setState("checking"); setAttempt(value => value + 1); }} />
      ) : null}
    </main>
  );
}
