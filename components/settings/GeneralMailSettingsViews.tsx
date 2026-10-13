"use client";

import { useLocale, useTranslations } from "next-intl";

import { getPathname, usePathname } from "@/i18n/navigation";
import { localeNames, locales, type Locale } from "@/i18n/routing";
import { LocaleFlag } from "@/components/ui/LocaleFlag";
import { useSettings } from "@/context/settings-context";

import { DEFAULT_USER_SETTINGS } from "@/lib/user-settings";

import { MailboxVisibilitySettings } from "./MailboxVisibilitySettings";
import { MailboxIconSettings } from "./MailboxIconSettings";
import { LayoutWidthSettings } from "./LayoutWidthSettings";

import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";

import { SegmentedControl } from "@/components/ui/SegmentedControl";

import { SettingsPageIntro, SettingsPanel, SettingsSaveBar, SettingRow, SwitchRow } from "./SettingsPrimitives";

function Select({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: DropdownOption[]; label: string }) {
  return <Dropdown value={value} onChange={onChange} options={options} variant="form" align="right" label={label} />;
}

export function LocaleSettingsView() {
  const t = useTranslations("settingsSystem");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const { draft, updateSection, replaceSection, hydrated, save } = useSettings();
  const current = draft.locale;
  const changeLocale = async (next: string) => {
    if (!locales.includes(next as Locale) || next === locale) return;
    if (!await save()) return;
    const localized = getPathname({ href: pathname, locale: next as Locale, forcePrefix: true });
    window.location.replace(`${localized}${window.location.search}${window.location.hash}`);
  };
  const preview = hydrated ? new Intl.DateTimeFormat(locale, { dateStyle: current.dateFormat === "long" ? "full" : current.dateFormat === "iso" ? "short" : "medium", timeStyle: "short", hour12: current.timeFormat === "12", timeZone: current.timezone }).format(new Date("2026-09-13T09:30:00+09:00")) : "—";
  return <><SettingsPageIntro title={t("nav.locale")} description={t("descriptions.locale")} /><SettingsPanel title={t("sections.languageRegion")}>
    <SettingRow title={t("fields.displayLanguage")}><Dropdown label={t("fields.displayLanguage")} value={locale} onChange={changeLocale} options={locales.map((value) => ({ value, label: localeNames[value], icon: <LocaleFlag locale={value} /> }))} variant="form" overlay menuMinWidth={240} hideScrollbar align="right" className="sm:w-60" /></SettingRow>
    <SettingRow title={t("fields.timezone")}><Select label={t("fields.timezone")} value={current.timezone} onChange={(timezone) => updateSection("locale", { timezone })} options={["Asia/Seoul","Asia/Tokyo","Asia/Shanghai","Europe/London","America/New_York","America/Los_Angeles"].map((value) => ({ value, label: t(`options.timezones.${value.replaceAll("/", "_")}`) }))} /></SettingRow>
    <SettingRow title={t("fields.dateFormat")}><SegmentedControl label={t("fields.dateFormat")} value={current.dateFormat} onChange={(dateFormat) => updateSection("locale", { dateFormat })} options={["locale","iso","long"].map((value) => ({ value: value as typeof current.dateFormat, label: t(`options.dateFormat.${value}`) }))} /></SettingRow>
    <SettingRow title={t("fields.timeFormat")}><SegmentedControl label={t("fields.timeFormat")} value={current.timeFormat} onChange={(timeFormat) => updateSection("locale", { timeFormat })} options={[{ value: "12" as const, label: t("options.timeFormat.12") }, { value: "24" as const, label: t("options.timeFormat.24") }]} /></SettingRow>
    <SettingRow title={t("fields.weekStart")}><SegmentedControl label={t("fields.weekStart")} value={current.weekStart} onChange={(weekStart) => updateSection("locale", { weekStart })} options={["sunday","monday"].map((value) => ({ value: value as typeof current.weekStart, label: t(`options.weekStart.${value}`) }))} /></SettingRow>
    <div className="rounded-(--radius-app) bg-(--surface-muted) p-4"><p className="text-xs font-semibold text-(--text-muted)">{t("common.preview")}</p><p className="mt-1 text-sm font-medium">{preview}</p></div>
  </SettingsPanel><SettingsSaveBar onReset={() => replaceSection("locale", structuredClone(DEFAULT_USER_SETTINGS.locale))} /></>;
}

export function AccessibilitySettingsView() {
  const t = useTranslations("settingsSystem");
  const { draft, updateSection, replaceSection } = useSettings();
  const value = draft.accessibility;
  return <><SettingsPageIntro title={t("nav.accessibility")} description={t("descriptions.accessibility")} /><SettingsPanel title={t("sections.readability")}><SettingRow title={t("fields.fontScale")}><SegmentedControl label={t("fields.fontScale")} value={value.fontScale} onChange={(fontScale) => updateSection("accessibility", { fontScale })} options={["90","100","110","125"].map((item) => ({ value: item as typeof value.fontScale, label: `${item}%` }))} /></SettingRow><SwitchRow title={t("fields.highContrast")} value={value.highContrast} onChange={(highContrast) => updateSection("accessibility", { highContrast })} /><SwitchRow title={t("fields.reduceMotion")} value={value.reduceMotion} onChange={(reduceMotion) => updateSection("accessibility", { reduceMotion })} /><SwitchRow title={t("fields.enhancedFocus")} value={value.enhancedFocus} onChange={(enhancedFocus) => updateSection("accessibility", { enhancedFocus })} /><SwitchRow title={t("fields.screenReaderDetails")} value={value.screenReaderDetails} onChange={(screenReaderDetails) => updateSection("accessibility", { screenReaderDetails })} /><SwitchRow title={t("fields.keyboardNavigation")} value={value.keyboardNavigation} onChange={(keyboardNavigation) => updateSection("accessibility", { keyboardNavigation })} /></SettingsPanel><SettingsSaveBar onReset={() => replaceSection("accessibility", structuredClone(DEFAULT_USER_SETTINGS.accessibility))} /></>;
}

export function InboxSettingsView() {
  const reading = useTranslations("readingPane");
  const t = useTranslations("settingsSystem"); const { draft, updateSection, replaceSection } = useSettings(); const value = draft.inbox; const display = useTranslations("mailboxDisplay");
  const tr = (key: string) => t(key as never);
  const select = <K extends keyof typeof value>(key: K, options: string[]) => <Select label={tr(`fields.${String(key)}`)} value={String(value[key])} onChange={(next) => updateSection("inbox", { [key]: next } as Partial<typeof value>)} options={options.map((item) => ({ value: item, label: tr(`options.${String(key)}.${item}`) }))} />;
  return <><SettingsPageIntro title={t("nav.inbox-display")} description={t("descriptions.inbox")} /><SettingsPanel title={t("sections.inboxLayout")}><SwitchRow title={display("counts")} value={value.showMailboxCounts} onChange={(showMailboxCounts) => updateSection("inbox", { showMailboxCounts })} /><SwitchRow title={display("storage")} value={value.showMailboxStorage} onChange={(showMailboxStorage) => updateSection("inbox", { showMailboxStorage })} /><SwitchRow title={reading("infoTitle")} value={value.showDeliveryDetails} onChange={(showDeliveryDetails) => updateSection("inbox", { showDeliveryDetails })} /><SettingRow title={t("fields.density")}>{select("density", ["comfortable","compact"])}</SettingRow><SettingRow title={t("fields.previewPane")}>{select("previewPane", ["right","bottom","off"])}</SettingRow><SwitchRow title={t("fields.conversationView")} value={value.conversationView} onChange={(conversationView) => updateSection("inbox", { conversationView })} /><SettingRow title={t("fields.markRead")}>{select("markRead", ["immediate","2seconds","manual"])}</SettingRow><SettingRow title={t("fields.remoteImages")}>{select("remoteImages", ["always","contacts","never"])}</SettingRow><SettingRow title={t("fields.pageSize")}>{select("pageSize", ["25","50","100"])}</SettingRow><SettingRow title={t("fields.mailDateFormat")}><Select label={t("fields.mailDateFormat")} value={value.dateFormat} onChange={(dateFormat) => updateSection("inbox", { dateFormat: dateFormat as typeof value.dateFormat })} options={["relative","short","full"].map((item) => ({ value: item, label: t(`options.mailDateFormat.${item}` as never) }))} /></SettingRow><SettingRow title={t("fields.unreadStyle")}>{select("unreadStyle", ["bold","highlight","dot"])}</SettingRow><section aria-label={t("common.preview")} className={`grid overflow-hidden rounded-(--radius-app) border border-(--border-app) ${value.previewPane === "right" ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" : "grid-cols-1"}`}><div className={`border-(--border-app) ${value.previewPane === "right" ? "sm:border-r" : value.previewPane === "bottom" ? "border-b" : ""}`}><div className={`border-b border-(--border-app) px-4 ${value.density === "compact" ? "py-2" : "py-4"} ${value.unreadStyle === "highlight" ? "bg-(--color-primary)/8" : "bg-(--surface-app)"}`}><p className={value.unreadStyle === "bold" ? "font-bold" : "font-medium"}>{value.unreadStyle === "dot" ? "● " : ""}{t("preview.unreadSubject")}</p><p className="mt-1 truncate text-xs text-(--text-muted)">{t("preview.unreadBody")}</p></div>{value.conversationView ? <p className="px-4 py-2 text-xs text-(--text-muted)">{t("preview.conversationCount", { count: 3 })}</p> : null}</div>{value.previewPane !== "off" ? <div className="min-h-24 bg-(--surface-app) p-4"><p className="text-xs font-semibold text-(--text-muted)">{t("common.preview")}</p><p className="mt-2 text-sm">{t("preview.unreadBody")}</p></div> : null}</section></SettingsPanel><MailboxVisibilitySettings /><LayoutWidthSettings /><MailboxIconSettings /><SettingsSaveBar onReset={() => replaceSection("inbox", structuredClone(DEFAULT_USER_SETTINGS.inbox))} /></>;
}
