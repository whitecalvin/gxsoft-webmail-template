"use client";

import { useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { useLayoutWidths } from "@/context/layout-width-context";
import { useToast } from "@/context/toast-context";
import { resetLayoutWidth } from "@/lib/reset-layout-width";
import type { LayoutWidthKind } from "@/lib/layout-width-cookie";
import { Button } from "@/components/ui/Button";
import { SettingsPanel } from "./SettingsPrimitives";

export function LayoutWidthSettings() {
  const t = useTranslations("layoutWidthSettings");
  const { accountAddress } = useMail();
  const initial = useLayoutWidths();
  const account = accountAddress ?? initial.account;
  const toast = useToast();
  const reset = (kind: LayoutWidthKind) => {
    try { resetLayoutWidth(account, kind); toast.success(t("success")); }
    catch { toast.error(t("error")); }
  };
  return <SettingsPanel title={t("title")}>
    <p className="text-sm text-(--text-muted)">{t("description")}</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={!account.trim()} onClick={() => reset("sidebar")}>{t("sidebar")}</Button>
      <Button disabled={!account.trim()} onClick={() => reset("mail-list")}>{t("mailList")}</Button>
    </div>
  </SettingsPanel>;
}
