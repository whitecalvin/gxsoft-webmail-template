"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useLinkedAccounts } from "@/context/linked-accounts-context";
import { LINKED_AUTH_FAILURES, linkedAuthenticationCommand } from "@/lib/linked-authentication";
import type { LinkedAccount } from "@/lib/linked-accounts";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import { Modal } from "@/components/overlay/Modal";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { DialogActions } from "@/components/overlay/DialogActions";

export function NaverLinkedAuthentication({ account }: { account: LinkedAccount }) {
  const t = useTranslations("linkedAccountAuth"), common = useTranslations("common"), linked = useTranslations("linkedAccounts");
  const { snapshot, busy, uncertain, error, refresh, authenticate } = useLinkedAccounts();
  const [editing, setEditing] = useState<LinkedAccount | null>(null), [verifying, setVerifying] = useState<LinkedAccount | null>(null), [invalid, setInvalid] = useState(false);
  const password = useRef<HTMLInputElement>(null);
  const data = snapshot.status === "ready" ? snapshot.data : null;
  const supported = account.provider === "naver" && !!data && data.authenticationAvailable !== false && data.authenticationAvailable.naver;
  const locked = busy || uncertain || !supported;
  const close = () => { if (!busy && !uncertain) { if (password.current) password.current.value = ""; setEditing(null); setInvalid(false); } };
  const save = async () => {
    if (locked || !editing) return;
    const command = linkedAuthenticationCommand("credentials", editing.id, { expectedRevision: editing.revision, provider: "naver", appPassword: password.current?.value ?? "" });
    if (!command) { setInvalid(true); return; }
    if (password.current) password.current.value = "";
    setInvalid(false);
    if (await authenticate(command)) setEditing(null);
  };
  if (account.provider !== "naver") return null;
  return <>
    <Tooltip content={supported ? t("credentials") : t("auth_unavailable")}><span className="inline-flex"><Button size="icon" variant="ghost" disabled={locked} aria-label={`${t("credentials")}: ${account.email}`} onClick={() => { setEditing(account); setInvalid(false); }}><KeyRound size={16} /></Button></span></Tooltip>
    <Tooltip content={t("verify")}><span className="inline-flex"><Button size="icon" variant="ghost" disabled={locked || account.status === "pendingAuth" || account.status === "connected" || account.credentialGeneration === 0} aria-label={`${t("verify")}: ${account.email}`} onClick={() => setVerifying(account)}><ShieldCheck size={16} /></Button></span></Tooltip>
    {editing ? createPortal(<Modal ariaLabel={t("credentials")} maxWidth={480} onClose={close} dismissible={!busy && !uncertain} className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <header className="shrink-0 border-b border-(--border-app) px-4 py-4 sm:px-6"><h2 className="text-base font-semibold">{t("credentials")}</h2></header>
      <form className="flex min-h-0 flex-col" onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:px-6">
          <p className="break-all text-sm">{editing.email}</p><p className="text-sm text-(--text-muted)">{t("hint")}</p>
          <Input ref={password} data-modal-autofocus type="password" autoComplete="off" name="linked-app-password" label={t("password")} required maxLength={1024} disabled={locked} error={invalid ? t("invalidPassword") : undefined} />
          <p className="text-xs text-(--text-muted)">{t("saveOnly")}</p>
          {error ? <p role="alert" className="text-sm text-(--status-danger)">{uncertain ? linked("mutation_uncertain") : (LINKED_AUTH_FAILURES as readonly string[]).includes(error) ? t(error) : t("requestFailed")}</p> : null}
          {uncertain ? <Button disabled={busy} onClick={() => { void refresh(); }}>{linked("refresh")}</Button> : null}
        </div>
        <footer className="shrink-0 border-t border-(--border-app) px-4 py-3 sm:px-6"><DialogActions><Button type="submit" variant="primary" disabled={locked} loading={busy}>{common("save")}</Button><Button disabled={busy || uncertain} onClick={close}>{common("cancel")}</Button></DialogActions></footer>
      </form>
    </Modal>, document.body) : null}
    {verifying ? <ConfirmDialog tone="default" title={t("verify")} description={t("verifyConfirm", { email: verifying.email })} confirmLabel={t("verify")} confirmDisabled={locked}
      onCancel={() => { if (!busy) setVerifying(null); }} onConfirm={async () => {
        const a = verifying; setVerifying(null);
        await authenticate({ kind: "verify", id: a.id, input: { expectedRevision: a.revision } });
      }} /> : null}
  </>;
}
