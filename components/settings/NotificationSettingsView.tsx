"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSettings } from "@/context/settings-context";
import { useToast } from "@/context/toast-context";
import { DEFAULT_USER_SETTINGS } from "@/lib/user-settings";
import { validQuietTime } from "@/lib/mail-notifications";
import { enableNotificationSound, playNotificationSound, showMailNotification } from "@/lib/browser-mail-notification";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { SettingsPageIntro, SettingsPanel, SettingsSaveBar, SettingRow, SwitchRow } from "./SettingsPrimitives";

export function NotificationSettingsView() {
  const t = useTranslations("settingsSystem"), ko = useLocale() === "ko";
  const { draft, updateSection, replaceSection } = useSettings();
  const value = draft.notifications;
  const toast = useToast();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported" | "loading">("loading");
  useEffect(() => {
    const refresh = () => setPermission("Notification" in window && window.isSecureContext ? Notification.permission : "unsupported");
    refresh(); window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const request = async () => {
    if (permission !== "default") return;
    try { setPermission(await Notification.requestPermission()); } catch { toast.error(ko ? "알림 권한을 요청할 수 없습니다." : "Unable to request notification permission."); }
  };
  const sound = async () => {
    try { await enableNotificationSound(); playNotificationSound(); } catch { toast.warning(ko ? "이 브라우저에서는 알림 소리를 재생할 수 없습니다." : "Sound is unavailable in this browser."); }
  };
  const invalid = !validQuietTime(value.quietStart) || !validQuietTime(value.quietEnd);
  return <>
    <SettingsPageIntro title={t("nav.notifications")} description={ko ? "현재 계정의 서버 설정에 저장됩니다. 열린 받은편지함 첫 페이지를 갱신할 때 새 메일을 확인해 알립니다. 앱 종료 후 푸시 알림은 지원하지 않습니다." : "Saved to your account on the server. New mail is detected when the open inbox first page refreshes. Push while the app is closed is not supported."} />
    <SettingsPanel title={t("sections.notificationChannels")}>
      <SwitchRow title={t("fields.browserNotifications")} value={value.browser} onChange={(browser) => updateSection("notifications", { browser })} />
      <SettingRow title={ko ? "브라우저 알림 권한" : "Browser permission"} description={permission === "granted" ? (ko ? "허용됨" : "Granted") : permission === "denied" ? (ko ? "차단됨 · 브라우저 사이트 설정에서 허용하세요." : "Blocked. Allow notifications in browser site settings.") : permission === "unsupported" ? (ko ? "이 브라우저 또는 연결에서는 지원하지 않습니다." : "Not supported by this browser or connection.") : (ko ? "허용이 필요합니다." : "Permission is required.")}><Button onClick={() => void request()} disabled={permission !== "default"}>{ko ? "알림 권한 요청" : "Request permission"}</Button></SettingRow>
      <SwitchRow title={t("fields.notificationSound")} value={value.sound} onChange={(enabled) => { updateSection("notifications", { sound: enabled }); if (enabled) void sound(); }} />
      <SettingRow title={ko ? "알림 테스트" : "Test notifications"}><div className="flex flex-wrap gap-2"><Button disabled={!value.browser || permission !== "granted"} onClick={() => { if (!showMailNotification(ko ? "TASTEMAIL 테스트 알림" : "TASTEMAIL test notification", "gxmail-test")) toast.warning(ko ? "시스템 알림을 표시할 수 없습니다." : "Unable to display system notifications."); }}>{t("actions.testNotification")}</Button><Button disabled={!value.sound} onClick={() => void sound()}>{ko ? "소리 테스트" : "Test sound"}</Button></div></SettingRow>
      <p className="text-xs text-(--text-muted)">{ko ? "개인정보 보호를 위해 시스템 알림에는 메일 제목·발신자·본문을 표시하지 않습니다. 소리는 브라우저를 다시 연 뒤 소리 테스트로 활성화해야 할 수 있습니다." : "System notifications omit subject, sender and body for privacy. Sound may require activation using the sound test after reopening the browser."}</p>
    </SettingsPanel>
    <SettingsPanel title={t("sections.notificationRules")}>
      {(["important", "general"] as const).map((kind) => <SettingRow key={kind} title={t(`notificationTypes.${kind}`)}><Dropdown label={t(`notificationTypes.${kind}`)} align="right" variant="form" value={value.modes[kind]} options={[{ value: "instant", label: t("options.notificationMode.instant") }, { value: "off", label: t("options.notificationMode.off") }, { value: "digest", label: t("options.notificationMode.digest"), disabled: true }]} onChange={(mode) => updateSection("notifications", { modes: { ...value.modes, [kind]: mode as "instant" | "off" } })} /></SettingRow>)}
      <p className="text-xs text-(--text-muted)">{ko ? "중요 메일은 별표가 지정된 메일입니다. 이메일 요약·1시간 요약·결재·멘션·공유 편지함 알림은 서버 연동 미지원으로 실행하지 않습니다." : "Important means starred mail. Email/digest, approvals, mentions and shared mailbox notifications are not supported by the server integration."}</p>
    </SettingsPanel>
    <SettingsPanel title={t("sections.quietHours")}>
      <SwitchRow title={t("fields.weekendNotifications")} value={value.weekends} onChange={(weekends) => updateSection("notifications", { weekends })} />
      <SettingRow title={t("fields.quietStart")}><Input aria-label={t("fields.quietStart")} type="time" value={value.quietStart} onChange={(event) => updateSection("notifications", { quietStart: event.target.value })} /></SettingRow>
      <SettingRow title={t("fields.quietEnd")}><Input aria-label={t("fields.quietEnd")} type="time" value={value.quietEnd} onChange={(event) => updateSection("notifications", { quietEnd: event.target.value })} /></SettingRow>
      <p className="text-xs text-(--text-muted)">{ko ? "현재 기기의 시간대를 사용합니다. 시작·종료가 같으면 방해 금지 시간을 사용하지 않습니다. 테스트 알림은 이 제한을 적용하지 않습니다." : "Uses the device time zone. Equal times disable quiet hours. Test notifications bypass these restrictions."}</p>
    </SettingsPanel>
    <SettingsSaveBar saveDisabled={invalid} onReset={() => replaceSection("notifications", structuredClone(DEFAULT_USER_SETTINGS.notifications))} />
  </>;
}
