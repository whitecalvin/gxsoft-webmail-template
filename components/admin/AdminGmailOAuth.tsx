"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { Copy } from "lucide-react";
import { gmailOAuthCallback, gmailOAuthCheck, gmailOAuthError, gmailOAuthSaved, gmailOAuthSettings, gmailOAuthUpdate, type GmailOAuthSettings, type GmailOAuthCheck } from "@/lib/admin-gmail-oauth";
import { gmailOAuthCopy } from "@/lib/admin-gmail-oauth-copy";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Tooltip } from "@/components/ui/Tooltip";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { AdminPageActions } from "./AdminShell";
import { useAdminDraftGuard, useAdminDraftProtection } from "./AdminDraftGuard";
import { GmailOAuthSetupGuide } from "./GmailOAuthSetupGuide";
import { GmailOAuthWizard } from "./GmailOAuthWizard";
const subscribe = () => () => {};
export function AdminGmailOAuth({ initial, initialError }: { initial?: GmailOAuthSettings; initialError?: string }) {
  const locale = useLocale(), c = gmailOAuthCopy(locale), { requestAction } = useAdminDraftGuard();
  const browserOrigin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const [data, setData] = useState(initial), [error, setError] = useState(initialError), [message, setMessage] = useState("");
  const [clientId, setClientId] = useState(initial?.clientId ?? ""), [secret, setSecret] = useState(""), [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [origin, setOrigin] = useState(initial?.redirectUri ? new URL(initial.redirectUri).origin : ""), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [confirming, setConfirming] = useState(false), [checked, setChecked] = useState<GmailOAuthCheck>();
  const [wizard, setWizard] = useState(false);
  const lock = useRef(false), generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const publicOrigin = origin || (browserOrigin.startsWith("https:") ? browserOrigin : "");
  const https = browserOrigin.startsWith("https:");
  let callback = ""; try { if (publicOrigin) callback = gmailOAuthCallback(publicOrigin); } catch { /* 잘못된 주소는 저장 전에 검증한다. */ }
  const dirty = !!data && (clientId !== data.clientId || enabled !== data.enabled || !!secret || (!!origin && origin !== (data.redirectUri ? new URL(data.redirectUri).origin : "")));
  useAdminDraftProtection(dirty, busy);
  const disabled = busy || uncertain || !data;
  function adopt(next: GmailOAuthSettings) { setData(next); setClientId(next.clientId); setEnabled(next.enabled); setOrigin(next.redirectUri ? new URL(next.redirectUri).origin : ""); setSecret(""); setUncertain(false); setChecked(undefined); }
  async function run(action: "read" | "check" | "save") {
    if (lock.current || action !== "read" && (!data || uncertain)) return;
    let command;
    if (action === "save") {
      try { command = gmailOAuthUpdate({ expectedRevision: data!.revision, enabled, clientId, publicOrigin, ...(secret ? { clientSecret: secret } : {}) }); }
      catch { setError(callback ? "invalid_configuration" : "invalid_https_origin"); setSecret(""); return; }
      if (!https) { setError("insecure_connection"); setSecret(""); return; }
    }
    lock.current = true; setBusy(true); setError(undefined); setMessage(""); setChecked(undefined); setConfirming(false);
    const started = generation.current;
    // 재전송용 초안·브라우저 저장소·토스트에 비밀키를 남기지 않는다.
    if (action === "save") setSecret("");
    try {
      const response = await fetch(`/api/mail/admin/gmail-oauth${action === "check" ? "/check" : ""}`, { method: action === "read" ? "GET" : action === "save" ? "PATCH" : "POST", cache: "no-store", signal: AbortSignal.timeout(20000), ...(command ? { headers: { "content-type": "application/json" }, body: JSON.stringify(command) } : {}) });
      command = undefined;
      const value: unknown = await response.json();
      if (generation.current !== started) return;
      if (!response.ok) { const code = value && typeof value === "object" && "status" in value ? gmailOAuthError(value.status) : "unavailable"; throw Error(action === "save" && response.status >= 500 && !["settings_unavailable", "encryption_unavailable", "unsupported"].includes(code) ? "mutationUncertain" : code); }
      if (response.status !== 200) throw Error(action === "save" ? "mutationUncertain" : "unavailable");
      if (action === "read") adopt(gmailOAuthSettings(value));
      else if (action === "check") setChecked(gmailOAuthCheck(value));
      else {
        gmailOAuthSaved(value, data!.revision);
        setMessage(c.saved);
        // 保存 receipt は値を含まない。実サーバーを再取得するまでは再保存しない。
        setUncertain(true);
        const read = await fetch("/api/mail/admin/gmail-oauth", { cache: "no-store", signal: AbortSignal.timeout(15000) });
        const saved = gmailOAuthSettings(await read.json());
        if (!read.ok || saved.revision !== data!.revision + 1) throw Error("mutationUncertain");
        if (generation.current === started) adopt(saved);
      }
    } catch (e) {
      if (generation.current !== started) return;
      const code = e instanceof Error ? gmailOAuthError(e.message) : "unavailable";
      const failure = action === "save" && code === "unavailable" ? "mutationUncertain" : code;
      setError(failure); if (action === "save" && failure === "mutationUncertain") setUncertain(true);
      if (action === "read") setData(undefined);
    } finally { command = undefined; lock.current = false; if (generation.current === started) setBusy(false); }
  }
  const panel = "min-w-0 space-y-4 rounded-(--radius-app) border border-(--border-app) bg-background p-4";
  const errorText = error ? c.errors[gmailOAuthError(error) as keyof typeof c.errors] : "";
  const bool = (v: boolean) => c[v ? "yes" : "no"];
  return <section className="mx-auto w-full max-w-5xl space-y-4" aria-busy={busy}>
    <AdminPageActions><Button disabled={busy} onClick={() => requestAction(() => void run("read"), dirty)}>{c.refresh}</Button></AdminPageActions>
    <p className="text-sm text-(--text-muted)">{c.intro}</p>
    {errorText && <p role="alert" className="text-sm text-(--status-danger)">{errorText}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {data && <section className={panel}><h2 className="font-semibold">{c.source}</h2><p>{c[data.source]}</p><dl className="grid gap-2 text-sm sm:grid-cols-3">{([[c.savedSecret, data.secretConfigured], [c.encryption, data.encryptionAvailable], [c.available, data.available]] as const).map(([label, value]) => <div key={label}><dt className="text-(--text-muted)">{label}</dt><dd>{bool(value)}</dd></div>)}</dl>{data.redirectUri && <p className="break-all text-xs">{data.redirectUri}</p>}</section>}
    <form className={panel} onSubmit={e => { e.preventDefault(); if (!disabled && https && callback && clientId && data?.encryptionAvailable) setConfirming(true); }}>
      <Input label={c.origin} value={publicOrigin} disabled={disabled} maxLength={1800} placeholder="https://webmail.example.com" onChange={e => { setOrigin(e.target.value); setChecked(undefined); }} />
      <p className="break-all text-xs text-(--text-muted)">{c.current}: {browserOrigin || "—"}</p>
      {!https && <p className="text-sm text-(--text-muted)">{c.https}</p>}
      <div className="flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{c.callback}</p><code className="block select-all break-all text-xs">{callback || "—"}</code></div><Tooltip content={c.copy}><Button size="icon" variant="ghost" aria-label={c.copy} disabled={!callback} onClick={async () => { try { await navigator.clipboard.writeText(callback); setMessage(c.copied); } catch { setMessage(c.copyFailed); } }}><Copy size={16}/></Button></Tooltip></div>
      {data?.redirectUri && callback && (data.redirectUri !== callback || https && data.redirectUri !== gmailOAuthCallback(browserOrigin)) && <p role="status" className="text-sm text-(--status-warning)">{c.mismatch}</p>}
      <Input label={c.clientId} value={clientId} disabled={disabled} maxLength={1024} autoComplete="off" spellCheck={false} onChange={e => { setClientId(e.target.value); setChecked(undefined); }} />
      <Input label={c.secret} type="password" value={secret} disabled={disabled || !https} maxLength={1024} autoComplete="new-password" hint={c.secretHint} onChange={e => { setSecret(e.target.value); setChecked(undefined); }} />
      <div className="flex items-center justify-between gap-4"><span className="text-sm">{c.enabled}</span><Switch label={c.enabled} on={enabled} disabled={disabled} onToggle={() => { setEnabled(v => !v); setChecked(undefined); }}/></div>
      <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" disabled={disabled || !https || !callback || !clientId || !data?.encryptionAvailable} loading={busy}>{c.save}</Button><Button disabled={disabled || dirty} onClick={() => void run("check")}>{c.check}</Button></div>
      {checked && <p role={checked.available ? "status" : "alert"} className="text-sm">{checked.available ? c.checked : c.checkFailed} {!checked.configurationValid && `${c.available}: ${c.no}.`} {!checked.encryptionAvailable && c.errors.encryption_unavailable}</p>}
    </form>
    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{c.help}</h2><Button size="sm" onClick={() => setWizard(true)}>{locale === "ko" ? "단계별 설정 마법사" : "Step-by-step setup wizard"}</Button></div><GmailOAuthSetupGuide locale={locale} origin={callback ? new URL(callback).origin : ""} callback={callback}/></section>
    {wizard && <GmailOAuthWizard locale={locale} origin={callback ? new URL(callback).origin : ""} callback={callback} onClose={() => setWizard(false)}/>}
    {confirming && <ConfirmDialog tone="default" title={c.save} description={c.confirm} confirmLabel={c.save} confirmDisabled={disabled} onCancel={() => setConfirming(false)} onConfirm={() => void run("save")} />}
  </section>;
}
