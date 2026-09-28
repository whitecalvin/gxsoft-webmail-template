import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { mailDataMode } from "@/lib/tastemail/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (mailDataMode() === "mock") return children;
  const t = await getTranslations("adminLive");
  return <main className="flex min-h-dvh items-center justify-center bg-(--surface-muted) p-5">
    <section className="w-full max-w-lg rounded-(--radius-app) border border-(--border-app) bg-background p-6 sm:p-8">
      <p className="text-sm font-bold text-(--color-primary-ink)">GXWebMail</p>
      <h1 className="mt-5 text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-3 text-sm leading-6 text-(--text-muted)">{t("description")}</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-(--radius-app) bg-(--color-primary-solid) px-5 text-sm font-semibold text-white outline-none focus-visible:ring-3 focus-visible:ring-(--focus-ring)">{t("backToMail")}</Link>
    </section>
  </main>;
}
