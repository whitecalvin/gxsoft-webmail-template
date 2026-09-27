"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { localeNames, type Locale } from "@/i18n/routing";
import { useToast } from "@/context/toast-context";

// Mocked signup screen — validates the form client-side only, then redirects
// to /login after a fake delay. No account is actually created anywhere.
export default function SignupPage() {
  const router = useRouter();
  const toast = useToast();
  const locale = useLocale() as Locale;
  const t = useTranslations("auth.signup");
  const common = useTranslations("auth.common");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<"requiredFields" | "passwordMismatch" | "consentRequired" | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name || !email || !password) {
      setError("requiredFields");
      return;
    }
    if (password !== confirmPassword) {
      setError("passwordMismatch");
      return;
    }
    if (!agreed) {
      setError("consentRequired");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    window.setTimeout(() => router.push("/login"), 500);
  };

  const openTerms = () => toast.info(common("termsNotice"));
  const openPrivacy = () => toast.info(common("privacyNotice"));
  const inputClassName =
    "h-12 rounded-[10px] border border-(--border-app) bg-black/1.5 px-3.5 text-sm text-foreground outline-none transition duration-200 focus:border-(--color-primary) focus:bg-transparent focus:ring-3 focus:ring-blue-500/10 dark:bg-white/3";

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
          <section aria-labelledby="signup-heading" className="mx-auto w-full max-w-md">
            <h1
              id="signup-heading"
              className="text-[32px] font-bold leading-[1.15] tracking-[-0.035em] text-foreground sm:text-[36px]"
            >
              {t("title")}
            </h1>
            <p className="mt-3 max-w-[38ch] break-keep text-sm leading-6 text-(--text-muted)">
              {t("description")}
            </p>

            <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-(--text-muted)">{t("name")}</span>
                <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("namePlaceholder")} className={inputClassName} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-(--text-muted)">{common("email")}</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gxsoft.co.kr" className={inputClassName} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-(--text-muted)">{common("password")}</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("passwordPlaceholder")} className={inputClassName} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-(--text-muted)">{t("confirmPassword")}</span>
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t("confirmPlaceholder")} className={inputClassName} />
              </label>

              <div className="mt-1 flex items-start gap-2 text-left text-[13px] text-foreground">
                <button
                  type="button"
                  onClick={() => setAgreed((value) => !value)}
                  role="checkbox"
                  aria-checked={agreed}
                  aria-label={t("consentLabel")}
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] outline-none transition focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2"
                  style={{
                    backgroundColor: agreed ? "var(--color-primary)" : "transparent",
                    border: agreed ? "none" : "1px solid var(--border-app)",
                  }}
                >
                  {agreed ? <Check size={10} strokeWidth={3} className="text-white" /> : null}
                </button>
                <span className="text-(--text-muted)">
                  {t.rich("consent", {
                    terms: (chunks) => <Link href="#terms" onClick={(event) => { event.preventDefault(); openTerms(); }} className="rounded font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)">{chunks}</Link>,
                    privacy: (chunks) => <Link href="#privacy" onClick={(event) => { event.preventDefault(); openPrivacy(); }} className="rounded font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)">{chunks}</Link>,
                  })}
                </span>
              </div>

              {error ? <p role="alert" className="text-xs font-medium text-(--status-danger)">{t(error)}</p> : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-1 flex h-12 items-center justify-center rounded-[10px] text-sm font-semibold text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--color-primary)_22%,transparent)] outline-none transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 disabled:translate-y-0 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {isSubmitting ? t("submitting") : t("submit")}
              </button>
            </form>

            <p className="mt-6 text-sm text-(--text-muted) xl:hidden">
              {common("haveAccount")}{" "}
              <Link href="/login" className="rounded font-semibold text-(--color-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2">
                {common("signIn")}
              </Link>
            </p>
          </section>
        </div>

        <footer className="mx-auto flex w-full max-w-md flex-col gap-3 border-t border-(--border-app) pt-5 text-[11px] text-(--text-muted) sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:pt-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="#terms" onClick={(event) => { event.preventDefault(); openTerms(); }} className="rounded outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--color-primary)">
              {common("terms")}
            </Link>
            <Link href="#privacy" onClick={(event) => { event.preventDefault(); openPrivacy(); }} className="rounded outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--color-primary)">
              {common("privacy")}
            </Link>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <span>{localeNames[locale]}</span>
            <Link href="/setup" className="rounded font-medium outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--color-primary)">
              {common("setupWizard")}
            </Link>
          </div>
        </footer>
      </main>

      <aside aria-label={t("productIntro")} className="relative hidden min-h-dvh overflow-hidden bg-[#17181B] xl:flex">
        <div
          className="pointer-events-none absolute"
          style={{
            inset: "auto -140px -220px auto",
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 0%, transparent) 70%)",
            opacity: 0.42,
          }}
        />

        <div className="relative mx-auto flex w-full max-w-2xl flex-col px-16 py-12 2xl:px-20 2xl:py-16">
          <div className="my-auto py-12">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-white/50">{common("eyebrow")}</p>
            <h2 className="mt-4 max-w-[14ch] text-balance break-keep text-[42px] font-bold leading-[1.12] tracking-[-0.04em] text-white 2xl:text-[48px]">
              {t("tagline")}
            </h2>

            <ul className="mt-10 flex flex-col gap-4 border-y border-white/10 py-6 text-sm text-white/75">
              {(["brandedWorkspace", "integratedTools", "secureOperations"] as const).map((key) => (
                <li key={key} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-(--color-primary)" />
                  {t(`benefits.${key}`)}
                </li>
              ))}
            </ul>

            <p className="mt-8 text-sm text-white/75">
              {common("haveAccount")}{" "}
              <Link href="/login" className="rounded font-semibold text-white underline decoration-white/40 underline-offset-4 outline-none transition hover:decoration-white focus-visible:ring-2 focus-visible:ring-white">
                {common("signIn")}
              </Link>
            </p>
          </div>

          <p className="text-xs text-white/40">{common("procurementNotice")}</p>
        </div>
      </aside>
    </div>
  );
}
