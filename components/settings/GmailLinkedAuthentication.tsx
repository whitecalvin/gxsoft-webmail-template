"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LogIn } from "lucide-react";
import { useLinkedAccounts } from "@/context/linked-accounts-context";
import type { LinkedAccount } from "@/lib/linked-accounts";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
export function GmailLinkedAuthentication({ account }: { account: LinkedAccount }) {
  const t = useTranslations("linkedGmailAuth"), auth = useTranslations("linkedAccountAuth"), locale = useLocale();
  const { snapshot, busy, uncertain, startOAuth } = useLinkedAccounts(), [confirming, setConfirming] = useState(false);
  if (account.provider !== "gmail") return null;
  const supported = snapshot.status === "ready" && snapshot.data.authenticationAvailable !== false && snapshot.data.authenticationAvailable.gmail;
  const locked = busy || uncertain || !supported;
  const reconnect = account.status === "connected" || account.status === "reauthRequired";
  const label = reconnect ? (locale === "ko" ? "Gmail 다시 인증" : "Reconnect Gmail") : t("start");
  return <>
    <div className="min-w-0"><Tooltip content={supported ? label : auth("auth_unavailable")}><span className="inline-flex"><Button size="sm" variant="ghost" disabled={locked} aria-label={`${label}: ${account.email}`} leadingIcon={<LogIn size={16}/>} onClick={() => setConfirming(true)}>{label}</Button></span></Tooltip>{!supported && <p className="max-w-56 text-xs text-(--text-muted)">{locale === "ko" ? "관리자가 Gmail OAuth 설정을 저장·검사한 뒤 목록을 다시 확인하세요." : "Ask an administrator to save/check Gmail OAuth settings, then refresh accounts."}</p>}</div>
    {confirming ? <ConfirmDialog tone="default" title={t("start")} description={t("confirm", { email: account.email })} confirmLabel={t("start")} confirmDisabled={locked} onCancel={() => { if (!busy) setConfirming(false); }} onConfirm={async () => {
      setConfirming(false); await startOAuth(account.id, locale);
    }} /> : null}
  </>;
}
