"use client";

import { useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import { ShieldCheck } from "lucide-react";

import { localeNames, type Locale } from "@/i18n/routing";

import { clientLoginFailure } from "@/lib/tastemail/client-session-status";
import { useBranding } from "@/context/branding-context";
import { BrandMark } from "@/components/layout/BrandMark";
import { LoginGeometry } from "./LoginGeometry";

// Authentication uses the same-origin session route and HttpOnly cookies.
export default function LoginPageClient({ sessionEnded = false }: { sessionEnded?: boolean } = {}) {


  const locale = useLocale() as Locale;
  const t = useTranslations("auth.login");
  const common = useTranslations("auth.common");
  const service = useTranslations("liveService");

  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<"missingCredentials" | "invalidCredentials" | "mfaRequired" | "invalidMfaCode" | "forbidden" | "rateLimited" | "serverUnavailable" | "insecureConnection" | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || submittingRef.current) return;
    if (!email.trim() || !password) {
      setError("missingCredentials");
      return;
    }
    if (mfaRequired && !mfaCode.trim()) {
      setError("mfaRequired");
      return;
    }
    {
      const { protocol, hostname } = window.location;
      const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname.toLowerCase());
      if (protocol !== "https:" && !(protocol === "http:" && isLoopback)) {
        setError("insecureConnection");
        return;
      }
    }
    setError(null);
    submittingRef.current = true;
    setIsSubmitting(true);
    {
      try {
        const response = await fetch("/api/mail/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: email.trim(), password, ...(mfaCode.trim() ? { mfaCode: mfaCode.trim() } : {}) }),
          signal: AbortSignal.timeout(20_000),
        });
        const result: unknown = await response.json().catch(() => null);
        const status = result && typeof result === "object" && "status" in result ? result.status : null;
        if (!response.ok) {
          const failure = clientLoginFailure(response.status, result);
          if (failure === "mfaRequired" || failure === "invalidMfaCode") {
            setMfaRequired(true);
            setError(failure);
          } else {
            if (failure === "invalidCredentials") setMfaRequired(false);
            setError(failure);
          }
          return;
        }
        if (status !== "authenticated") {
          setError("serverUnavailable");
          return;
        }
        setPassword("");
        setMfaCode("");
        // The protected page validates the new HttpOnly cookie server-side.
        // A second browser session request here can fail during an upstream
        // interruption even after login successfully created the session.
        window.location.replace(`/${locale}`);
      } catch {
        setError("serverUnavailable");
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
      return;
    }

  };

  return (
    <div className="min-h-dvh w-full bg-background xl:grid xl:grid-cols-[minmax(32rem,0.9fr)_minmax(40rem,1.1fr)]">
      <main className="flex min-h-dvh w-full flex-col px-6 py-6 sm:px-10 sm:py-8 lg:px-12 xl:px-16 2xl:py-12">
        <div className="flex flex-1 items-center py-8 sm:py-10 2xl:py-12">
          <div className="mx-auto w-full max-w-md">
        <header className="mb-8 flex w-full items-center gap-3 sm:mb-10">
          <BrandMark className="size-8" />
          <span className="min-w-0 break-words text-[17px] font-bold tracking-tight text-foreground">
            {branding.displayName}
          </span>
        </header>

          <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.035em] text-foreground sm:text-[36px]">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-[38ch] break-keep text-sm leading-6 text-(--text-muted)">
            {t("liveDescription")}
          </p>

          {branding.loginNotice ? <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-(--surface-muted) p-3 text-sm">{branding.loginNotice}</p> : null}
          {sessionEnded ? <p role="status" className="mt-4 rounded-lg border border-(--border-app) bg-(--surface-muted) p-3 text-sm text-foreground">{service("unauthorized")}</p> : null}
          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-(--text-muted)">
                {common("email")}
              </span>
              <input
                id="login-email"
                name="username"
                type="email"
                autoComplete="username"
                disabled={isSubmitting}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setMfaRequired(false); setMfaCode(""); setError(null); }}
                placeholder="jiwoo.han@gxsoft.co.kr"
                className="h-12 rounded-[10px] border border-(--border-app) bg-black/1.5 px-3.5 text-sm text-foreground outline-none transition duration-200 focus:border-(--color-primary) focus:bg-transparent focus:ring-3 focus:ring-blue-500/10 dark:bg-white/3"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-(--text-muted)">
                {common("password")}
              </span>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                disabled={isSubmitting}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setMfaRequired(false); setMfaCode(""); setError(null); }}
                placeholder={t("passwordPlaceholder")}
                className="h-12 rounded-[10px] border border-(--border-app) bg-black/1.5 px-3.5 text-sm text-foreground outline-none transition duration-200 focus:border-(--color-primary) focus:bg-transparent focus:ring-3 focus:ring-blue-500/10 dark:bg-white/3"
              />
            </label>

            {mfaRequired ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-(--text-muted)">{t("mfaCodeLabel")}</span>
                <input id="login-mfa-code" name="mfaCode" type="text" autoComplete="one-time-code" maxLength={32} spellCheck={false} disabled={isSubmitting} value={mfaCode} onChange={(event) => { setMfaCode(event.target.value); setError(null); }} className="h-12 rounded-[10px] border border-(--border-app) bg-black/1.5 px-3.5 text-sm text-foreground outline-none focus:border-(--color-primary) dark:bg-white/3" />
              </label>
            ) : null}

            {null}

            {error && (
              <p role="alert" className="text-xs font-medium text-(--status-danger)">
                {t(error)}
              </p>
            )}

            <div className="mt-1 flex flex-col gap-2.5">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-12 items-center justify-center rounded-[10px] text-sm font-semibold text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--color-primary)_22%,transparent)] outline-none transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 disabled:translate-y-0 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {isSubmitting ? t("submitting") : common("signIn")}
              </button>
              {null}
            </div>
          </form>

          {(mfaRequired) ? <div className="mt-6 flex items-center gap-3 border-l-2 border-(--color-primary) bg-black/2.5 px-3.5 py-3 dark:bg-white/4">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-primary) 15%, transparent)",
                color: "var(--color-primary)",
              }}
            >
              <ShieldCheck size={14} />
            </span>
            <p className="text-xs leading-relaxed text-(--text-muted)">
              {t("twoFactorHint")}
            </p>
          </div> : null}
          {null}
          </div>
        </div>

        <footer className="mx-auto flex w-full max-w-md flex-col gap-3 border-t border-(--border-app) pt-5 text-[11px] text-(--text-muted) sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:pt-0">
          {null}
          {branding.supportEmail || branding.supportUrl ? <div className="flex min-w-0 flex-wrap gap-3">
            {branding.supportEmail ? <a href={`mailto:${branding.supportEmail}`} className="break-all hover:underline">{branding.supportEmail}</a> : null}
            {branding.supportUrl ? <a href={branding.supportUrl} rel="noopener noreferrer" className="break-all hover:underline">{new URL(branding.supportUrl).hostname}</a> : null}
          </div> : null}
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <span>{localeNames[locale]}</span>
            {null}
          </div>
        </footer>
      </main>

      <aside className="relative hidden min-h-dvh overflow-hidden bg-[#17181B] xl:flex">
        <LoginGeometry />

        <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col px-16 py-12 2xl:px-20 2xl:py-16">
          <div className="my-auto py-12">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-white/50">
              {common("eyebrow")}
            </p>
            <h2 className="mt-4 max-w-[14ch] text-balance break-keep text-[42px] font-bold leading-[1.12] tracking-[-0.04em] text-white 2xl:text-[48px]">
              {t("liveTagline")}
            </h2>

            {null}

            {null}
          </div>

          {null}
        </div>
      </aside>
    </div>
  );
}
