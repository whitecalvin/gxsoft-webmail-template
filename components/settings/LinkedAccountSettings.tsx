"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Mail, Plus, RefreshCw, Unplug } from "lucide-react";
import { useLinkedAccounts } from "@/context/linked-accounts-context";
import { linkedRegistration, LINKED_PROVIDERS, type LinkedProvider, type LinkedAccount, type LinkedFailure } from "@/lib/linked-accounts";
import { SettingsPanel } from "./SettingsPrimitives";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import { Modal } from "@/components/overlay/Modal";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { DialogActions } from "@/components/overlay/DialogActions";
import { NaverLinkedAuthentication } from "./NaverLinkedAuthentication";
import { GmailLinkedAuthentication } from "./GmailLinkedAuthentication";
import { LINKED_AUTH_FAILURES } from "@/lib/linked-authentication";
import { LinkedMailViewer } from "./LinkedMailViewer";
export function LinkedAccountSettings() {
  const t = useTranslations("linkedAccounts"), connection = useTranslations("linkedAccountConnection"), auth = useTranslations("linkedAccountAuth"), common = useTranslations("common"), service = useTranslations("liveService");
  const { snapshot, busy, uncertain, error, refresh, mutate } = useLinkedAccounts();
  const [adding, setAdding] = useState(false), [provider, setProvider] = useState<LinkedProvider>("tastemail"), [email, setEmail] = useState("");
  const [deleting, setDeleting] = useState<LinkedAccount | null>(null), [invalid, setInvalid] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const reader = useTranslations("linkedMail");
  const data = snapshot.status === "ready" ? snapshot.data : null;
  const locked = busy || uncertain || !data;
  const failure = error ?? (snapshot.status !== "ready" ? snapshot.status : null);
  const failureText = (status: LinkedFailure) => ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(status) ? service(status) : (LINKED_AUTH_FAILURES as readonly string[]).includes(status) ? auth(status) : t(status);
  const close = () => { if (!busy && !uncertain) { setAdding(false); setInvalid(false); setEmail(""); } };
  const register = async () => {
    const command = linkedRegistration({ provider, email });
    if (!command) { setInvalid(true); return; }
    if (await mutate(command)) { setAdding(false); setEmail(""); setInvalid(false); }
  };
  const errors = failure ? <p role="alert" className="text-sm text-(--status-danger)">{failureText(failure)}</p> : null;
  return <>
    <SettingsPanel title={t("title")} description={t("description")} actions={<div className="flex flex-wrap gap-2">
      <Tooltip content={t("refresh")}><Button size="icon" variant="ghost" aria-label={t("refresh")} disabled={busy} onClick={() => { void refresh(); }}><RefreshCw size={16} /></Button></Tooltip>
      <Button size="sm" leadingIcon={<Plus size={16} />} disabled={locked || !!data && data.accounts.length >= data.limit} onClick={() => { setAdding(true); setInvalid(false); }}>{t("add")}</Button>
    </div>}>
      {errors}
      <p className="text-sm text-(--text-muted)">{data && data.authenticationAvailable !== false ? auth("scope") : t("notAuthenticated")}</p>
      {data ? <><p className="text-xs text-(--text-muted)">{t("count", { count: data.accounts.length, limit: data.limit })}</p>
        {!data.accounts.length ? <p className="text-sm text-(--text-muted)">{t("empty")}</p> : <ul className="divide-y divide-(--border-app)">{data.accounts.map(account => <li key={account.id} className="flex min-w-0 items-center gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{account.email}</p><p className="mt-1 text-xs text-(--text-muted)">{t(account.provider)} · {account.status === "connected" || account.status === "temporaryError" ? connection(account.status) : t(account.status)}</p></div>
          <NaverLinkedAuthentication account={account} />
          <GmailLinkedAuthentication account={account} />
          <Tooltip content={reader("open")}><span className="inline-flex"><Button size="icon" variant="ghost" disabled={busy || !data || !account.capabilities.read} aria-label={`${reader("open")}: ${account.email}`} onClick={() => setViewing(account.id)}><Mail size={16} /></Button></span></Tooltip>
          <Tooltip content={t("disconnect")}><span className="inline-flex"><Button size="icon" variant="ghost" disabled={locked} aria-label={`${t("disconnect")}: ${account.email}`} onClick={() => setDeleting(account)}><Unplug size={16} /></Button></span></Tooltip>
        </li>)}</ul>}</> : null}
    </SettingsPanel>
    {viewing ? createPortal(<LinkedMailViewer initialId={viewing} onClose={() => setViewing(null)} />, document.body) : null}
    {adding ? createPortal(<Modal ariaLabel={t("add")} onClose={close} dismissible={!busy && !uncertain} maxWidth={480} className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <header className="shrink-0 border-b border-(--border-app) px-4 py-4 sm:px-6"><h2 className="text-base font-semibold">{t("add")}</h2></header>
      <form onSubmit={e => { e.preventDefault(); void register(); }} className="flex min-h-0 flex-col">
        <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:px-6">
          <label className="grid gap-1.5 text-sm">{t("provider")}<CustomSelect value={provider} aria-label={t("provider")} disabled={locked} onChange={e => { setProvider(e.target.value as LinkedProvider); setInvalid(false); }} className="app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm">
            {LINKED_PROVIDERS.map(value => <option key={value} value={value}>{t(value)}</option>)}
          </CustomSelect></label>
          <Input data-modal-autofocus label={t("email")} type="email" name="linked-email" value={email} autoComplete="email" required maxLength={254} disabled={locked} placeholder={provider === "gmail" ? "name@gmail.com" : provider === "naver" ? "name@naver.com" : "name@example.com"} error={invalid ? t("invalid_request") : undefined} onChange={e => { setEmail(e.target.value); setInvalid(false); }} />
          <p className="text-xs text-(--text-muted)">{data && data.authenticationAvailable !== false ? auth("scope") : t("notAuthenticated")}</p>{errors}
          {uncertain ? <Button size="sm" disabled={busy} onClick={() => { void refresh(); }}>{t("refresh")}</Button> : null}
        </div>
        <footer className="shrink-0 border-t border-(--border-app) px-4 py-3 sm:px-6"><DialogActions><Button type="submit" variant="primary" disabled={locked} loading={busy}>{t("register")}</Button><Button disabled={busy || uncertain} onClick={close}>{common("cancel")}</Button></DialogActions></footer>
      </form>
    </Modal>, document.body) : null}
    {deleting ? <ConfirmDialog title={t("disconnect")} description={t("disconnectConfirm", { email: deleting.email })} tone="warning" confirmLabel={t("disconnect")} confirmDisabled={locked} onCancel={() => { if (!busy) setDeleting(null); }} onConfirm={async () => {
      const account = deleting; setDeleting(null);
      await mutate({ method: "DELETE", id: account.id, input: { expectedRevision: account.revision } });
    }} /> : null}
  </>;
}
