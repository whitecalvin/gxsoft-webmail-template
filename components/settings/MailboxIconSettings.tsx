"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useServerMailboxIcons } from "@/context/mailbox-icon-context";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";
import { resetMailboxIcons } from "@/components/mail/PersonalFolderIcon";
import { Button } from "@/components/ui/Button";
import { SettingsPanel } from "./SettingsPrimitives";
import { IconPreferenceRecovery } from "@/components/mail/IconPreferenceRecovery";
import { IconPreferenceImport } from "./IconPreferenceImport";

export function MailboxIconSettings() {
  const t = useTranslations("folderIcons");
  const { accountAddress } = useMail();
  const toast = useToast();
  const server = useServerMailboxIcons(accountAddress ?? "");
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  return <SettingsPanel title={t("resetTitle")}>
    <p className="text-sm text-(--text-muted)">{t("resetDescription")}</p>
    <IconPreferenceRecovery />
    <Button loading={saving} disabled={!accountAddress?.trim() || saving} onClick={async () => {
      if (!accountAddress?.trim() || pending.current) return;
      pending.current = true; setSaving(true);
      try {
        if (server.required && !await server.resetMailboxIcons()) { toast.error(t("resetError")); return; }
        resetMailboxIcons(accountAddress); toast.success(t("resetSuccess"));
      }
      catch { toast.error(t("resetError")); }
      finally { pending.current = false; setSaving(false); }
    }}>{t("resetButton")}</Button>
    <IconPreferenceImport key={(accountAddress ?? "").trim().toLowerCase()} />
  </SettingsPanel>;
}
