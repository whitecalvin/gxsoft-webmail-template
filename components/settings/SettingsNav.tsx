"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SETTINGS_NAV_GROUPS, type SettingsNavKey } from "@/lib/mock-settings";

export function SettingsNav({ active }: { active: SettingsNavKey }) {
  const t = useTranslations("settingsSystem");
  return <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-(--border-app) bg-(--surface-muted) p-3 lg:flex"><p className="px-2 pb-3 text-sm font-bold">{t("title")}</p><nav aria-label={t("navigationLabel")} className="min-h-0 flex-1 space-y-4 overflow-y-auto">{SETTINGS_NAV_GROUPS.map((group) => <section key={group.key} aria-labelledby={`settings-group-${group.key}`}><h2 id={`settings-group-${group.key}`} className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-(--text-muted)">{t(`groups.${group.key}`)}</h2><ul className="space-y-0.5">{group.items.map((item) => <li key={item.key}><Link href={item.href} className={`block rounded-(--radius-app) px-2.5 py-2 text-[13px] transition ${active === item.key ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)" : "text-(--text-muted) hover:bg-(--control-hover) hover:text-foreground"}`}>{t(`nav.${item.key}`)}</Link></li>)}</ul></section>)}</nav></aside>;
}
