"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { CURRENT_USER } from "@/lib/current-user";
import { useToast } from "@/context/toast-context";
import { localeNames, type Locale } from "@/i18n/routing";
import { useMail } from "@/context/mail-context";

// Mock mode preserves the local demo login; live mode uses the same-origin session route.
export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const locale = useLocale() as Locale;
  const t = useTranslations("auth.login");
  const common = useTranslations("auth.common");
  const { mode, retryLoad } = useMail();
  const [email, setEmail] = useState(mode === "live" ? "" : CURRENT_USER.email);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [remember, setRemember] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<"missingCredentials" | "invalidCredentials" | "mfaRequired" | "invalidMfaCode" | "forbidden" | "rateLimited" | "serverUnavailable" | "insecureConnection" | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("missingCredentials");
      return;
    }
    if (mode === "live") {
      const { protocol, hostname } = window.location;
      const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname.toLowerCase());
      if (protocol !== "https:" && !(protocol === "http:" && isLoopback)) {
        setError("insecureConnection");
        return;
      }
    }
    setError(null);
    setIsSubmitting(true);
    if (mode === "live") {
      try {
        const response = await fetch("/api/mail/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: email.trim(), password, ...(mfaCode.trim() ? { mfaCode: mfaCode.trim() } : {}) }),
          signal: AbortSignal.timeout(20_000),
        });
        const result: unknown = await response.json();
        const status = result && typeof result === "object" && "status" in result ? result.status : null;
        if (!response.ok) {
          if (status === "mfaRequired" || status === "invalidMfaCode") {
            setMfaRequired(true);
            setError(status);
          } else {
            setError(status === "insecure_transport" ? "insecureConnection" : status === "unauthorized" ? "invalidCredentials" : status === "forbidden" || status === "rateLimited" ? status : "serverUnavailable");
          }
          return;
        }
        retryLoad();
        router.push("/");
        router.refresh();
      } catch {
        setError("serverUnavailable");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    window.setTimeout(() => {
      try {
        window.localStorage.setItem("gxmail:session", remember ? "persistent" : "session");
      } catch {
        // localStorage unavailable; proceed without persisting the session flag
      }
      router.push("/");
    }, 500);
  };

  return (
    <div className="min-h-dvh w-full bg-background xl:grid xl:grid-cols-[minmax(32rem,0.9fr)_minmax(40rem,1.1fr)]">
      <main className="flex min-h-dvh w-full flex-col px-6 py-6 sm:px-10 sm:py-8 lg:px-12 xl:px-16 2xl:py-12">
        <header className="mx-auto flex w-full max-w-md items-center gap-3">
          <span
            className="flex size-8 items-center justify-center rounded-[10px] text-sm font-bold text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--color-primary)_24%,transparent)]"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            G
          </span>
          <span className="text-[17px] font-bold tracking-tight text-foreground">
            GXWebMail
          </span>
        </header>

        <div className="flex flex-1 items-center py-8 sm:py-10 2xl:py-12">
          <div className="mx-auto w-full max-w-md">
          <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.035em] text-foreground sm:text-[36px]">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-[38ch] break-keep text-sm leading-6 text-(--text-muted)">
            {t("description")}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-(--text-muted)">
                {common("email")}
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jiwoo.han@gxsoft.co.kr"
                className="h-12 rounded-[10px] border border-(--border-app) bg-black/1.5 px-3.5 text-sm text-foreground outline-none transition duration-200 focus:border-(--color-primary) focus:bg-transparent focus:ring-3 focus:ring-blue-500/10 dark:bg-white/3"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-(--text-muted)">
                {common("password")}
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
                className="h-12 rounded-[10px] border border-(--border-app) bg-black/1.5 px-3.5 text-sm text-foreground outline-none transition duration-200 focus:border-(--color-primary) focus:bg-transparent focus:ring-3 focus:ring-blue-500/10 dark:bg-white/3"
              />
            </label>

            {mode === "live" && mfaRequired ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-(--text-muted)">{t("mfaCodeLabel")}</span>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} className="h-12 rounded-[10px] border border-(--border-app) bg-black/1.5 px-3.5 text-sm text-foreground outline-none focus:border-(--color-primary) dark:bg-white/3" />
              </label>
            ) : null}

            {mode === "mock" ? <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setRemember((v) => !v)}
                role="checkbox"
                aria-checked={remember}
                className="flex items-center gap-2 rounded-md text-[13px] font-medium text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2"
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-[5px]"
                  style={{
                    backgroundColor: remember ? "var(--color-primary)" : "transparent",
                    border: remember ? "none" : "1px solid var(--border-app)",
                  }}
                >
                  {remember && <Check size={10} strokeWidth={3} className="text-white" />}
                </span>
                {t("rememberMe")}
              </button>
              <Link
                href="#reset"
                onClick={(e) => {
                  e.preventDefault();
                  toast.info(t("resetNotice"), { sub: email || t("enterEmailFirst") });
                }}
                className="rounded text-[13px] font-medium text-(--text-muted) outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2"
              >
                {t("forgotPassword")}
              </Link>
            </div> : null}

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
              {mode === "mock" ? <button
                type="button"
                onClick={() => toast.info(t("ssoNotice"), { sub: t("ssoContact") })}
                className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-(--border-app) bg-background text-[13px] font-semibold text-(--text-muted) outline-none transition duration-200 hover:border-(--text-muted) hover:text-foreground active:translate-y-px focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2 dark:hover:bg-white/3"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-(--text-app) text-[9px] font-extrabold text-(--surface-app)">
                  S
                </span>
                {t("ssoButton")}
              </button> : null}
            </div>
          </form>

          <div className="mt-6 flex items-start gap-3 border-l-2 border-(--color-primary) bg-black/2.5 px-3.5 py-3 dark:bg-white/4">
            <span
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold"
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
          </div>
          {mode === "mock" ? <p className="mt-7 text-sm text-(--text-muted) xl:hidden">
            {common("noAccount")}{" "}
            <Link href="/signup" className="rounded font-semibold text-(--color-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2">
              {common("signUp")}
            </Link>
          </p> : null}
          </div>
        </div>

        <footer className="mx-auto flex w-full max-w-md flex-col gap-3 border-t border-(--border-app) pt-5 text-[11px] text-(--text-muted) sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:pt-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="#terms"
              onClick={(e) => {
                e.preventDefault();
                toast.info(common("termsNotice"));
              }}
              className="rounded outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--color-primary)"
            >
              {common("terms")}
            </Link>
            <Link
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                toast.info(common("privacyNotice"));
              }}
              className="rounded outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--color-primary)"
            >
              {common("privacy")}
            </Link>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <span>{localeNames[locale]}</span>
            {mode === "mock" ? <Link href="/setup" className="rounded font-medium outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--color-primary)">
              {common("setupWizard")}
            </Link> : null}
          </div>
        </footer>
      </main>

      <aside className="relative hidden min-h-dvh overflow-hidden bg-[#17181B] xl:flex">
        <div
          className="pointer-events-none absolute"
          style={{
            inset: "auto -140px -220px auto",
            width: 520,
            height: 520,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 0%, transparent) 70%)",
            opacity: 0.42,
          }}
        />

        <div className="relative mx-auto flex w-full max-w-2xl flex-col px-16 py-12 2xl:px-20 2xl:py-16">
          <div className="my-auto py-12">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-white/50">
              {common("eyebrow")}
            </p>
            <h2 className="mt-4 max-w-[14ch] text-balance break-keep text-[42px] font-bold leading-[1.12] tracking-[-0.04em] text-white 2xl:text-[48px]">
              {t("tagline")}
            </h2>

            <div className="mt-10 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center border-y border-white/10 py-6">
            {[
              { id: "uptime", value: "99.99%", label: t("uptime") },
              { id: "largeAttachments", value: "2 GB", label: t("largeAttachments") },
              { id: "certified", value: "ISMS-P", label: t("certified") },
            ].flatMap((stat, index) => [
              <div key={stat.id} className={index === 1 ? "px-5" : index === 2 ? "pl-5" : "pr-5"}>
                <p className="text-xl font-semibold tracking-tight text-white tabular-nums">{stat.value}</p>
                <p className="mt-1.5 text-[11px] text-white/50">{stat.label}</p>
              </div>,
              ...(index < 2 ? [<span key={`${stat.id}-divider`} className="h-10 w-px bg-white/10" />] : []),
            ])}
            </div>

            {mode === "mock" ? <p className="mt-8 text-sm text-white/75">
              {common("noAccount")}{" "}
              <Link href="/signup" className="rounded font-semibold text-white underline decoration-white/40 underline-offset-4 outline-none transition hover:decoration-white focus-visible:ring-2 focus-visible:ring-white">
                {common("signUp")}
              </Link>
            </p> : null}
          </div>

          <p className="text-xs text-white/40">
            {common("procurementNotice")}
          </p>
        </div>
      </aside>
    </div>
  );
}
