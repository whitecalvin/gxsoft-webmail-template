"use client";

import { useLocale, useTranslations } from "next-intl";
import { SHORTCUT_GROUPS } from "@/lib/mock-shortcuts";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SettingsHeaderTitle } from "@/components/settings/SettingsHeaderTitle";
import { SettingsNav } from "@/components/settings/SettingsNav";

// Keyboard shortcut reference. Static/read-only — deliberately styled to
// look printable, per the "인쇄용 전체 목록 보기" link that leads here.
export default function ShortcutsPage() {
  const locale = useLocale();
  const t = useTranslations("shortcutReference");
  const edition = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date("2026-09-01T12:00:00Z"));
  return (
    <WorkspaceLayout title={<SettingsHeaderTitle title={t("title")} />} titleAsHeading={false} showGlobalSearch={false} className="flex flex-col bg-(--surface-muted) lg:flex-row">
      <SettingsNav active="shortcuts" />
      <section aria-labelledby="shortcuts-heading" className="min-h-0 w-full flex-1 overflow-y-auto py-8">
        <div className="mx-auto max-w-3xl px-4">
          <article className="border border-(--border-app) bg-background p-8 sm:p-12">
            <header className="flex items-start justify-between gap-4 border-b-2 border-(--text-app) pb-4">
              <div>
                <h1 id="shortcuts-heading" className="text-[26px] font-bold tracking-tight">{t("title")}</h1>
                <p className="mt-1 text-xs text-(--text-muted)">
                  {t("printEdition", { edition })}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-(--text-muted)">
                <p>
                  {t.rich("openWith", { key: (chunks) => <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">{chunks}</code> })}
                </p>
                <p className="mt-0.5">{t("windowsModifier")}</p>
              </div>
            </header>

            <div className="mt-6 columns-1 gap-11 sm:columns-2">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.id} className="mb-6 break-inside-avoid">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[.06em]" style={{ color: "var(--color-primary-ink)" }}>
                    {t(`groups.${group.id}`)}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {group.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-[12.5px]">
                        <span className="flex-1 text-(--text-muted)">{t(`actions.${item.id}`)}</span>
                        <span className="flex shrink-0 gap-1">
                          {item.keys.map((k, i) => (
                            <kbd
                              key={i}
                              className="rounded border border-b-2 border-(--border-app) bg-black/2 px-1.5 py-0.5 font-mono text-[11px] font-semibold dark:bg-white/4"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <footer className="mt-2 flex items-center justify-between border-t border-(--border-app) pt-3.5 text-xs text-(--text-muted)">
              <p>{t("footerNote")}</p>
              <p>gxsoft.co.kr</p>
            </footer>
          </article>
        </div>
      </section>
    </WorkspaceLayout>
  );
}
