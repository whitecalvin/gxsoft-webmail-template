"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SettingsHeaderTitle } from "./SettingsHeaderTitle";
import { SETTINGS_NAV_GROUPS } from "@/lib/mock-settings";

export function SettingsLanding() {
  const t = useTranslations("settingsSystem");
  return <WorkspaceLayout title={<SettingsHeaderTitle title={t("title")} />} titleAsHeading={false} showGlobalSearch={false} className="bg-(--surface-muted)"><div className="mx-auto h-full w-full max-w-3xl space-y-5 overflow-y-auto p-4 sm:p-7"><h1 className="sr-only">{t("title")}</h1>{SETTINGS_NAV_GROUPS.map((group) => <section key={group.key}><h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-(--text-muted)">{t(`groups.${group.key}`)}</h2><div className="overflow-hidden rounded-(--radius-app) border border-(--border-app) bg-(--surface-app)">{group.items.map((item, index) => <Link key={item.key} href={item.href} className={`flex min-h-12 items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-(--control-hover) ${index ? "border-t border-(--border-app)" : ""}`}><span className="min-w-0 flex-1">{t(`nav.${item.key}`)}</span><ChevronRight size={16} className="shrink-0 text-(--text-muted)" /></Link>)}</div></section>)}</div></WorkspaceLayout>;
}
