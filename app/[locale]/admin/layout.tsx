import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import { livePageSessionStatus } from "@/lib/tastemail/page-session";
import { LiveSessionUnavailable } from "@/components/layout/LiveSessionUnavailable";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminServiceError, loadAdmin } from "@/lib/tastemail/admin";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import type { AdminOverview } from "@/lib/tastemail/admin-contract";

export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {

  const { locale } = await params;
  const status = await livePageSessionStatus(locale);
  if (status !== "ready") return <LiveSessionUnavailable status={status} />;
  const t = await getTranslations("adminLive");
  const service = await getTranslations("liveService");
  const nav = await getTranslations("adminNav");
  let failure: "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" = "retryable";
  let initial: AdminOverview | null = null;
  try {
    const token = await tastemailSessionToken();
    if (!token) failure = "unauthorized";
    else initial = await loadAdmin(token, "operations") as AdminOverview;
  } catch (error) { failure = error instanceof AdminServiceError ? error.status : "retryable"; }
  if (initial) return <AdminShell initial={initial}>{children}</AdminShell>;
  return <main className="flex min-h-dvh items-center justify-center bg-(--surface-muted) p-5">
    <section className="w-full max-w-lg rounded-(--radius-app) border border-(--border-app) bg-background p-6 sm:p-8">
      <p className="text-sm font-bold text-(--color-primary-ink)">GXWebMail</p>
      <h1 className="mt-5 text-2xl font-bold text-foreground">{nav("tabs.dash")}</h1>
      <p role="alert" className="mt-3 text-sm leading-6 text-(--text-muted)">{service(failure)}</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-(--radius-app) bg-(--color-primary-solid) px-5 text-sm font-semibold text-white outline-none focus-visible:ring-3 focus-visible:ring-(--focus-ring)">{t("backToMail")}</Link>
    </section>
  </main>;
}
