"use client";

import { useTranslations } from "next-intl";

import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SettingsHeaderTitle } from "@/components/settings/SettingsHeaderTitle";

// Accessibility (KWCAG 2.2) compliance report — a static self-audit page for
// public-sector procurement requirements. Read-only aside from navigation.
export default function AccessibilityPage() {

  const t = useTranslations("accessibilityReport");

  {
    return <WorkspaceLayout title={<SettingsHeaderTitle title={t("title")} />} titleAsHeading={false} showGlobalSearch={false} className="flex flex-col bg-(--surface-muted) lg:flex-row">
      <section aria-label={t("sectionLabel")} className="min-h-0 w-full flex-1 overflow-y-auto p-5 sm:p-8">
        <div role="status" className="mx-auto max-w-3xl rounded-(--radius-app) border border-(--border-app) bg-background p-6">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-2 text-sm text-(--text-muted)">{t("liveAuditUnavailable")}</p>
        </div>
      </section>
    </WorkspaceLayout>;
  }

}
