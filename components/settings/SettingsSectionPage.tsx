"use client";

import { useState, type ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SettingsHeaderTitle } from "./SettingsHeaderTitle";
import { SettingsNav } from "./SettingsNav";
import { AccessibilitySettingsView, AwaySettingsView, InboxSettingsView, LocaleSettingsView, NotificationSettingsView, SendingSettingsView, SignatureSettingsViewV2, ThemeSettingsView } from "./GeneralMailSettingsViews";
import { AccountSettingsView, BlockedSendersSettingsView, FiltersSettingsView, IntegrationsSettingsView, LabelsSettingsView, SecuritySettingsView, ShortcutsSettingsView } from "./ManagementAccountSettingsViews";
import type { SettingsNavKey } from "@/lib/mock-settings";
import { useSettings } from "@/context/settings-context";
import { useTheme } from "@/context/theme-context";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { Button } from "@/components/ui/Button";

const SECTIONS: Record<SettingsNavKey, ComponentType> = {
  locale: LocaleSettingsView,
  theme: ThemeSettingsView,
  accessibility: AccessibilitySettingsView,
  signature: SignatureSettingsViewV2,
  "inbox-display": InboxSettingsView,
  sending: SendingSettingsView,
  away: AwaySettingsView,
  notifications: NotificationSettingsView,
  labels: LabelsSettingsView,
  filters: FiltersSettingsView,
  "blocked-senders": BlockedSendersSettingsView,
  account: AccountSettingsView,
  security: SecuritySettingsView,
  integrations: IntegrationsSettingsView,
  shortcuts: ShortcutsSettingsView,
};

export function SettingsSectionPage({ active }: { active: SettingsNavKey }) {
  const t = useTranslations("settingsSystem");
  const View = SECTIONS[active];
  const title = t(`nav.${active}`);
  const router = useRouter();
  const { isDirty, discard } = useSettings();
  const { isDirty: themeDirty, closeCustomizer } = useTheme();
  const [confirmBack, setConfirmBack] = useState(false);
  const leave = () => { discard(); closeCustomizer({ discard: true }); setConfirmBack(false); router.push("/settings"); };
  return <WorkspaceLayout title={<SettingsHeaderTitle title={title} />} titleAsHeading={false} showGlobalSearch={false} className="flex flex-col bg-(--surface-muted) lg:flex-row"><SettingsNav active={active} /><section aria-label={title} className="min-h-0 min-w-0 flex-1 overflow-y-auto"><div className="mx-auto flex min-h-full max-w-5xl flex-col gap-5 p-4 pb-0 sm:p-7 sm:pb-0"><Button variant="ghost" leadingIcon={<ArrowLeft size={16} />} onClick={() => { if (isDirty || themeDirty) setConfirmBack(true); else router.push("/settings"); }} className="self-start text-(--text-muted) lg:hidden">{t("title")}</Button><View /></div></section>{confirmBack ? <ConfirmDialog tone="warning" title={t("unsaved.title")} description={t("unsaved.description")} confirmLabel={t("unsaved.leave")} cancelLabel={t("unsaved.stay")} onCancel={() => setConfirmBack(false)} onConfirm={leave} /> : null}</WorkspaceLayout>;
}
