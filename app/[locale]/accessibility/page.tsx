"use client";

import { useLocale, useTranslations } from "next-intl";
import { A11Y_ROWS, CONTRAST_ROWS } from "@/lib/mock-accessibility";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SettingsHeaderTitle } from "@/components/settings/SettingsHeaderTitle";
import { SettingsNav } from "@/components/settings/SettingsNav";

// Accessibility (KWCAG 2.2) compliance report — a static self-audit page for
// public-sector procurement requirements. Read-only aside from navigation.
export default function AccessibilityPage() {
  const locale = useLocale();
  const t = useTranslations("accessibilityReport");
  const passed = A11Y_ROWS.filter((r) => r.state === "pass").length;
  const auditDate = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date("2026-08-28T12:00:00Z"));

  return (
    <WorkspaceLayout title={<SettingsHeaderTitle title={t("title")} />} titleAsHeading={false} headerActions={<span className="rounded-full bg-(--status-success-bg) px-3 py-1.5 text-xs font-bold text-(--status-success)">{t("passSummary", { passed, total: A11Y_ROWS.length })}</span>} showGlobalSearch={false} className="flex flex-col bg-(--surface-muted) lg:flex-row">
      <SettingsNav active="accessibility" />
      <section aria-label={t("sectionLabel")} className="min-h-0 w-full flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-5 sm:p-8">
        <h1 className="sr-only">{t("title")}</h1>
        <p className="text-xs text-(--text-muted)">{t("auditNote", { date: auditDate })}</p>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-xl border border-(--border-app) bg-background p-5">
            <h2 className="mb-3 text-sm font-bold">{t("checklist")}</h2>
            <div className="flex flex-col gap-2">
              {A11Y_ROWS.map((r) => (
                <div key={r.id} className="flex items-center gap-3 border-b border-(--border-app) pb-2 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{t(`checks.${r.id}`)}</p>
                    <p className="text-[10.5px] text-(--text-muted)">{r.criterion}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.state === "pass"
                        ? "bg-(--status-success-bg) text-(--status-success)"
                        : "bg-(--status-warning-bg) text-(--status-warning)"
                    }`}
                  >
                    {t(`states.${r.state}`)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-(--border-app) bg-background p-5">
              <h2 className="mb-3 text-sm font-bold">{t("contrastHeading")}</h2>
              <div className="flex flex-col gap-2.5">
                {CONTRAST_ROWS.map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg border border-(--border-app) bg-white text-xs font-bold"
                      style={{ color: r.fg }}
                    >
                      Aa
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium">{t("colorPair", { role: t(`colors.${r.id}`), foreground: r.fg, background: "#FFFFFF" })}</p>
                      <p className="text-[10.5px] text-(--text-muted)">{r.ratio}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        r.fail
                          ? "bg-(--status-warning-bg) text-(--status-warning)"
                          : "bg-(--status-success-bg) text-(--status-success)"
                      }`}
                    >
                      {r.state === "largeOnly" ? t("states.largeOnly") : r.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-(--border-app) bg-background p-5">
              <h2 className="mb-3 text-sm font-bold">{t("focusTouchHeading")}</h2>
              <button
                type="button"
                className="h-9 rounded-lg px-4 text-xs font-semibold text-white"
                style={{
                  backgroundColor: "var(--color-primary-solid)",
                  outline: "2px solid var(--color-primary)",
                  outlineOffset: "3px",
                }}
              >
                {t("focusState")}
              </button>
              <p className="mt-2 text-[11px] text-(--text-muted)">
                {t("touchTarget")}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-(--text-muted)">
                {t("focusRing")}
              </p>
              <div className="mt-3 rounded-lg bg-black/2 p-3 text-xs dark:bg-white/3">
                <p className="font-semibold">{t("assistiveTest")}</p>
                <p className="mt-1 text-(--text-muted)">NVDA 2025.1 · VoiceOver (macOS 15) · 센스리더 3.5</p>
                <p className="mt-1 text-(--text-muted)">
                  {t("mailListNote")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </section>
    </WorkspaceLayout>
  );
}
