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
  const locked = busy || uncertain || !supported || account.status === "connected";
  return <>
    <Tooltip content={supported ? t("start") : auth("auth_unavailable")}><span className="inline-flex"><Button size="icon" variant="ghost" disabled={locked} aria-label={`${t("start")}: ${account.email}`} onClick={() => setConfirming(true)}><LogIn size={16} /></Button></span></Tooltip>
    {confirming ? <ConfirmDialog tone="default" title={t("start")} description={t("confirm", { email: account.email })} confirmLabel={t("start")} confirmDisabled={locked} onCancel={() => { if (!busy) setConfirming(false); }} onConfirm={async () => {
      setConfirming(false); await startOAuth(account.id, locale);
    }} /> : null}
  </>;
}
