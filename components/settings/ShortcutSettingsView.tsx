"use client";
import { useLocale, useTranslations } from "next-intl";
import { useSettings } from "@/context/settings-context";
import { DEFAULT_USER_SETTINGS } from "@/lib/user-settings";
import { normalizeShortcut, SHORTCUT_ACTIONS, shortcutConflicts } from "@/lib/mail-shortcuts";
import { Input } from "@/components/ui/Input";
import { SettingsPageIntro, SettingsPanel, SettingsSaveBar, SettingRow, SwitchRow } from "./SettingsPrimitives";

export function ShortcutSettingsView() {
  const t = useTranslations("settingsSystem");
  const ko = useLocale() === "ko";
  const { draft, updateSection, replaceSection } = useSettings();
  const value = draft.shortcuts;
  const invalid = shortcutConflicts(value.bindings);
  return <>
    <SettingsPageIntro title={t("nav.shortcuts")} description={t("descriptions.shortcuts")} />
    <SettingsPanel title={t("sections.shortcuts")} description={ko ? "현재 브라우저에 저장됩니다. 입력 중·대화상자·메일 다중 선택 중에는 실행하지 않습니다. 문자 한 개 또는 공백으로 구분한 두 키를 입력하세요 (예: G I)." : "Saved in this browser. Disabled while typing, in dialogs or during multi-selection. Enter one character or two keys separated by a space (e.g. G I)."}>
      <SwitchRow title={t("fields.shortcutsEnabled")} value={value.enabled} onChange={(enabled) => updateSection("shortcuts", { enabled })} />
      {SHORTCUT_ACTIONS.map((action) => <SettingRow key={action} title={t(`shortcutActions.${action}`)}><Input aria-label={t(`shortcutActions.${action}`)} value={value.bindings[action]} maxLength={7} autoComplete="off" spellCheck={false} disabled={!value.enabled} onChange={(event) => updateSection("shortcuts", { bindings: { ...value.bindings, [action]: event.target.value.toUpperCase() } })} onBlur={() => { const normalized = normalizeShortcut(value.bindings[action]); if (normalized) updateSection("shortcuts", { bindings: { ...value.bindings, [action]: normalized } }); }} className="sm:w-28" /></SettingRow>)}
      {invalid ? <p role="alert" className="text-sm text-(--status-danger)">{ko ? "키 형식이 잘못되었거나 다른 단축키와 충돌합니다. 중복 키와 시작 키를 확인하세요." : "Invalid or conflicting keys. Check duplicate keys and sequence prefixes."}</p> : null}
    </SettingsPanel>
    <SettingsSaveBar saveDisabled={invalid} onReset={() => replaceSection("shortcuts", structuredClone(DEFAULT_USER_SETTINGS.shortcuts))} />
  </>;
}
