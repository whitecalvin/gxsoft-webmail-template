"use client";

import { useState, type ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SettingsHeaderTitle } from "./SettingsHeaderTitle";
import { AccessibilitySettingsView, InboxSettingsView, LocaleSettingsView } from "./GeneralMailSettingsViews";
import type { SettingsNavKey } from "@/lib/settings-navigation";
import { useSettings } from "@/context/settings-context";
import { useTheme } from "@/context/theme-context";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { LiveSignatureSettings } from "./LiveSignatureSettings";
import { LiveAccountSettings } from "./LiveAccountSettings";
import { LiveThemeSettings } from "./LiveThemeSettings";
import { LiveAwaySettings } from "./LiveAwaySettings";
import { LiveMailRules } from "./LiveMailRules";
import { LiveSecurity } from "./LiveSecurity";
import { ShortcutSettingsView } from "./ShortcutSettingsView";
import { LiveIntegrationSettings } from "./LiveIntegrationSettings";
import { LiveBlockedSenders } from "./LiveBlockedSenders";
import { NotificationSettingsView } from "./NotificationSettingsView";
import { SendingSettingsView } from "./SendingSettingsView";
import { LiveLabelSettings } from "./LiveLabelSettings";
import { GeneralSettingsStatus } from "./GeneralSettingsStatus";

const SECTIONS: Partial<Record<SettingsNavKey, ComponentType>> = {
  labels: LiveLabelSettings,
  sending: SendingSettingsView,
  notifications: NotificationSettingsView,
  "blocked-senders": LiveBlockedSenders,
  integrations: LiveIntegrationSettings,
  shortcuts: ShortcutSettingsView,
  locale: LocaleSettingsView,
  theme: LiveThemeSettings,
  accessibility: AccessibilitySettingsView,
  signature: LiveSignatureSettings,
  "inbox-display": InboxSettingsView,
  away: () => <LiveAwaySettings embedded />,
  filters: () => <LiveMailRules embedded />,
  account: LiveAccountSettings,
  security: () => <LiveSecurity embedded />,
};

export function SettingsSectionPage({ active }: { active: SettingsNavKey }) {
  const t = useTranslations("settingsSystem");
  const title = t(`nav.${active}`);
  const router = useRouter();
  const { isDirty, busy, uncertain, discard } = useSettings();
  const { isDirty: themeDirty, closeCustomizer } = useTheme();
  const [confirmBack, setConfirmBack] = useState(false);
  const leave = () => { if (busy || uncertain) return; discard(); closeCustomizer({ discard: true }); setConfirmBack(false); router.push("/settings"); };
  return <WorkspaceLayout title={<SettingsHeaderTitle title={title} />} titleAsHeading={false} showGlobalSearch={false} className="flex flex-col bg-(--surface-muted) lg:flex-row">
    <section aria-label={title} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-5 p-4 pb-0 sm:p-7 sm:pb-0">
        <Button variant="ghost" disabled={busy || uncertain} leadingIcon={<ArrowLeft size={16} />} onClick={() => { if (isDirty || themeDirty) setConfirmBack(true); else router.push("/settings"); }} className="self-start text-(--text-muted)">{t("title")}</Button>
        <SettingsSectionContent active={active} />
      </div>
    </section>
    {confirmBack ? <ConfirmDialog tone="warning" title={t("unsaved.title")} description={t("unsaved.description")} confirmDisabled={busy || uncertain} confirmLabel={t("unsaved.leave")} cancelLabel={t("unsaved.stay")} onCancel={() => setConfirmBack(false)} onConfirm={leave} /> : null}
  </WorkspaceLayout>;
}

export function SettingsSectionContent({ active }: { active: SettingsNavKey }) {
  const t = useTranslations("settingsSystem");
  const View = SECTIONS[active];
  const { hydrated } = useSettings();
  if (!hydrated && ["locale", "accessibility", "inbox-display", "sending", "notifications", "shortcuts"].includes(active)) return <GeneralSettingsStatus />;
  return !View ? (
    <div role="status" className="rounded-(--radius-app) border border-(--status-warning) bg-(--status-warning-bg) p-6">
      <h2 className="text-lg font-semibold">{t(`nav.${active}`)}</h2>
      <p className="mt-2 text-sm text-(--text-app)">{t(active === "shortcuts" ? "liveShortcutUnavailable" : "unavailableSetting")}</p>
    </div>
  ) : <View />;
}
