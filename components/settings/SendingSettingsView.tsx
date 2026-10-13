"use client";
import { useLocale, useTranslations } from "next-intl";
import { useSettings } from "@/context/settings-context";
import { DEFAULT_USER_SETTINGS } from "@/lib/user-settings";
import { validDefaultRecipients } from "@/lib/sending-settings";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { SettingRow, SettingsPageIntro, SettingsPanel, SettingsSaveBar } from "./SettingsPrimitives";

export function SendingSettingsView() {
  const t = useTranslations("settingsSystem"), ko = useLocale() === "ko";
  const { draft, updateSection, replaceSection } = useSettings();
  const current = draft.sending;
  const invalid = !validDefaultRecipients(current.defaultCc) || !validDefaultRecipients(current.defaultBcc);
  return <>
    <SettingsPageIntro title={t("nav.sending")} description={ko ? "현재 브라우저에 저장하며, 저장 후 새로 여는 작성·답장 화면에 적용됩니다." : "Saved in this browser and applied to newly opened compose and reply windows."} />
    <SettingsPanel title={t("sections.replyDefaults")}>
      <SettingRow title={t("fields.defaultReply")}><Dropdown variant="form" align="right" label={t("fields.defaultReply")} value={current.defaultReply} options={(["reply", "replyAll"] as const).map((value) => ({ value, label: t(`options.defaultReply.${value}`) }))} onChange={(value) => updateSection("sending", { defaultReply: value as typeof current.defaultReply })} /></SettingRow>
      <SettingRow title={t("fields.quoteStyle")}><Dropdown variant="form" align="right" label={t("fields.quoteStyle")} value={current.quoteStyle} options={(["inline", "below", "none"] as const).map((value) => ({ value, label: t(`options.quoteStyle.${value}`) }))} onChange={(value) => updateSection("sending", { quoteStyle: value as typeof current.quoteStyle })} /></SettingRow>
      <SettingRow title={t("fields.composeMode")}><Dropdown variant="form" align="right" label={t("fields.composeMode")} value={current.composeMode} options={(["html", "plain"] as const).map((value) => ({ value, label: t(`options.composeMode.${value}`) }))} onChange={(value) => updateSection("sending", { composeMode: value as typeof current.composeMode })} /></SettingRow>
      <SettingRow title={t("fields.defaultCc")}><Input aria-label={t("fields.defaultCc")} value={current.defaultCc} autoComplete="off" placeholder="person@example.com" onChange={(event) => updateSection("sending", { defaultCc: event.target.value })} error={!validDefaultRecipients(current.defaultCc) ? t("errors.invalidEmail") : undefined} /></SettingRow>
      <SettingRow title={t("fields.defaultBcc")}><Input aria-label={t("fields.defaultBcc")} value={current.defaultBcc} autoComplete="off" placeholder="person@example.com" onChange={(event) => updateSection("sending", { defaultBcc: event.target.value })} error={!validDefaultRecipients(current.defaultBcc) ? t("errors.invalidEmail") : undefined} /></SettingRow>
      <p className="text-xs text-(--text-muted)">{ko ? "참조·숨은 참조는 쉼표 또는 세미콜론으로 구분합니다. 개인 계정의 빈 새 메일에만 적용하며, 답장·전달·기존 초안·공유 계정에는 추가하지 않습니다." : "Separate addresses with commas or semicolons. Defaults apply only to blank new personal messages, not replies, forwards, existing drafts or shared accounts."}</p>
    </SettingsPanel>
    <SettingsPanel title={ko ? "지원 범위" : "Supported features"}><p className="text-sm text-(--text-muted)">{ko ? "자동 저장·수신 확인 요청·기본 예약 발송은 아직 설정과 연결되지 않았습니다. 작성창의 직접 임시저장·예약 발송 기능은 그대로 사용할 수 있습니다." : "Autosave, receipt requests and default scheduling are not connected to these settings yet. Manual draft saving and scheduled sending remain available in compose."}</p></SettingsPanel>
    <SettingsSaveBar saveDisabled={invalid} onReset={() => replaceSection("sending", structuredClone(DEFAULT_USER_SETTINGS.sending))} />
  </>;
}
