"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SettingsHeaderTitle } from "./SettingsHeaderTitle";
import { SETTINGS_NAV_GROUPS, type SettingsNavKey } from "@/lib/settings-navigation";
import { SettingsSectionContent } from "./SettingsSectionPage";
import { LiveAwaySettings } from "./LiveAwaySettings";
import { LiveMailRules } from "./LiveMailRules";
import { LiveSecurity } from "./LiveSecurity";
import type { InitialLiveSecurity } from "@/lib/tastemail/security";

function InlineSettings({ active, initialSecurity }: { active: SettingsNavKey; initialSecurity?: InitialLiveSecurity }) {

  {
    if (active === "away") return <LiveAwaySettings embedded />;
    if (active === "filters") return <div className="p-4 sm:p-7"><LiveMailRules embedded /></div>;
    if (active === "security") return <LiveSecurity embedded initial={initialSecurity} />;
  }
  return <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-7"><SettingsSectionContent active={active} /></div>;
}

export function SettingsLanding({ initialSecurity }: { initialSecurity?: InitialLiveSecurity } = {}) {
  const t = useTranslations("settingsSystem");
  const [panels, setPanels] = useState<Partial<Record<SettingsNavKey, boolean>>>({});
  return (
    <WorkspaceLayout title={<SettingsHeaderTitle title={t("title")} />} titleAsHeading={false} showGlobalSearch={false} className="bg-(--surface-muted)">
      <div className="mx-auto h-full w-full max-w-5xl space-y-5 overflow-y-auto p-4 sm:p-7">
        <h1 className="sr-only">{t("title")}</h1>
        {SETTINGS_NAV_GROUPS.map((group) => (
          <section key={group.key} aria-labelledby={`settings-group-${group.key}`}>
            <h2 id={`settings-group-${group.key}`} className="mb-2 px-1 text-sm font-bold text-(--text-muted)">{t(`groups.${group.key}`)}</h2>
            <ul className="overflow-hidden rounded-(--radius-app) border border-(--border-app) bg-(--surface-app)">
              {group.items.map((item, index) => (
                <li key={item.key} className={index ? "border-t border-(--border-app)" : ""}>
                  <h3>
                    <button type="button" id={`settings-trigger-${item.key}`} aria-expanded={panels[item.key] === true} aria-controls={`settings-panel-${item.key}`}
                      onClick={() => setPanels((current) => ({ ...current, [item.key]: !current[item.key] }))}
                      className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-(--control-hover) focus-visible:outline-2 focus-visible:outline-(--color-primary) focus-visible:-outline-offset-2">
                      <span className="min-w-0 flex-1">{t(`nav.${item.key}`)}</span>
                      <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-(--text-muted) transition-transform motion-reduce:transition-none ${panels[item.key] ? "rotate-180" : ""}`} />
                    </button>
                  </h3>
                  <div id={`settings-panel-${item.key}`} role="region" aria-labelledby={`settings-trigger-${item.key}`} hidden={!panels[item.key]} className="min-w-0 border-t border-(--border-app) bg-(--surface-muted)">
                    {/* 접어도 폼을 제거하지 않아 저장 전 입력 내용을 유지합니다. */}
                    {panels[item.key] !== undefined ? <InlineSettings active={item.key} initialSecurity={initialSecurity} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </WorkspaceLayout>
  );
}
