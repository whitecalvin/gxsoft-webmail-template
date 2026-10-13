"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { clientMailFailure, clientMutationFailure } from "@/lib/tastemail/client-session-status";
import { blockedSenderReplacement, managedBlockedSender, normalizeBlockedSender, type BlockedSender } from "@/lib/blocked-senders";
import type { LiveMailRules } from "@/lib/tastemail/mail-rules";
import { SettingsPageIntro, SettingsPanel } from "./SettingsPrimitives";

type Status = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
const failures = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"];
type Change = { add: BlockedSender; mailbox: string } | { removeId: string };

export function LiveBlockedSenders() {
  const t = useTranslations("settingsSystem");
  const service = useTranslations("liveService");
  const ko = useLocale() === "ko";
  const toast = useToast();
  const { mailboxes, mailboxSummaryStatus } = useMail();
  const junk = mailboxSummaryStatus === "ready" ? mailboxes.find((item) => item.role === "junk") : null;
  const [data, setData] = useState<LiveMailRules | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reload = () => { if (busy) return; setStatus("loading"); setPending(null); setAttempt((value) => value + 1); };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/rules", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(clientMailFailure(response.status, payload));
        if (!payload || typeof payload !== "object" || !("rules" in payload) || !Array.isArray(payload.rules) || !("revision" in payload) || !Number.isSafeInteger(payload.revision)) throw new Error("unavailable");
        if (controller.signal.aborted) return;
        setData(payload as LiveMailRules); setStatus("ready"); setUncertain(false); locked.current = false;
      }).catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const value = reason instanceof Error ? reason.message : "retryable";
        setStatus(failures.includes(value) ? value as Status : "retryable");
      });
    return () => controller.abort();
  }, [attempt]);
  const entries = data?.rules.flatMap((rule) => { const sender = managedBlockedSender(rule); return sender ? [{ ...sender, id: rule.id, enabled: rule.enabled }] : []; }) ?? [];
  const legacy = data && data.mode !== "rules" && (data.enabled || data.source.trim());
  const unavailable = status !== "ready" || busy || uncertain || !!legacy;
  const add = () => {
    if (unavailable || !data || !junk) return;
    const sender = normalizeBlockedSender(input);
    if (!sender) { setError(t("errors.invalidSender")); return; }
    try { blockedSenderReplacement(data, { add: sender, mailbox: junk.name }); }
    catch (reason) { setError(reason instanceof Error && reason.message === "duplicate" ? t("errors.duplicateSender") : ko ? "메일 규칙은 최대 50개까지 등록할 수 있습니다." : "At most 50 mail rules are allowed."); return; }
    setError(""); setPending({ add: sender, mailbox: junk.name });
  };
  const save = async () => {
    if (!pending || !data || unavailable || locked.current) return;
    const change = pending;
    const rules = blockedSenderReplacement(data, change);
    locked.current = true; setBusy(true); setPending(null);
    try {
      const response = await fetch("/api/mail/rules", { method: "PUT", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(45_000), body: JSON.stringify({ expectedRevision: data.revision, rules }) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(clientMutationFailure(response.status, payload));
      if (!payload || typeof payload !== "object" || !("rules" in payload) || !Array.isArray(payload.rules) || !("revision" in payload) || typeof payload.revision !== "number" || payload.revision <= data.revision) throw new Error("unavailable");
      if (!mounted.current) return;
      setData(payload as LiveMailRules); setInput(""); locked.current = false;
      toast.success(t("toast." + ("add" in change ? "senderBlocked" : "senderUnblocked")));
    } catch (reason) {
      if (!mounted.current) return;
      const value = reason instanceof Error ? reason.message : "retryable";
      if (["retryable", "unavailable", "conflict"].includes(value)) { setUncertain(true); toast.warning(ko ? "저장 결과가 확정되지 않았습니다. 목록을 다시 확인한 후 진행하세요." : "Save result is uncertain. Reload the list before continuing."); }
      else { locked.current = false; toast.error(failures.includes(value) ? service(value as Exclude<Status, "ready" | "loading">) : t("errors.invalidSender")); }
    } finally { if (mounted.current) setBusy(false); }
  };
  return <>
    <SettingsPageIntro title={t("nav.blocked-senders")} description={ko ? "차단한 발신자의 새 메일을 서버에서 스팸함으로 보냅니다. 기존 메일은 이동하지 않습니다. 도메인은 정확히 일치하는 도메인만 차단합니다." : "New mail from blocked senders goes to Spam on the server. Existing messages are unchanged. Domains match exactly."} />
    <SettingsPanel title={t("nav.blocked-senders")} actions={<Button size="sm" disabled={busy} loading={status === "loading"} onClick={reload}>{ko ? "목록 다시 확인" : "Reload list"}</Button>}>
      {status !== "loading" && status !== "ready" ? <SystemErrorNotice message={service(status)} actionLabel={service("retry")} onAction={reload} /> : null}
      {legacy ? <p role="note" className="text-sm text-(--status-warning)">{ko ? "기존 Sieve 스크립트를 보호하기 위해 변경할 수 없습니다. 메일 규칙에서 규칙 방식으로 전환한 후 이용하세요." : "Existing Sieve scripts are protected. Convert to managed rules in Mail Rules first."}</p> : null}
      {uncertain ? <p role="alert" className="text-sm text-(--status-warning)">{ko ? "저장 결과 확인이 필요합니다. 목록 다시 확인을 눌러주세요." : "Reload to confirm the save result."}</p> : null}
      {!junk ? <p role="note" className="text-xs text-(--text-muted)">{ko ? "스팸함 정보를 확인한 후 발신자를 추가할 수 있습니다." : "Sender blocking requires an available Spam mailbox."}</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); add(); }} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1"><Input aria-label={t("fields.senderOrDomain")} placeholder="sender@example.com / example.com" autoComplete="off" value={input} onChange={(event) => { setInput(event.target.value); setError(""); }} disabled={unavailable || !junk} error={error || undefined} /></div>
        <Button type="submit" disabled={unavailable || !junk || !input.trim()}>{ko ? "차단 추가" : "Block sender"}</Button>
      </form>
      {status === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p> : status === "ready" && !entries.length ? <p className="py-4 text-sm text-(--text-muted)">{ko ? "차단된 발신자가 없습니다." : "No blocked senders."}</p> : null}
      <ul className="divide-y divide-(--border-app)">{entries.map((entry) => <li key={entry.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{entry.value}</p><p className="mt-1 text-xs text-(--text-muted)">{entry.type === "domain" ? (ko ? "도메인" : "Domain") : (ko ? "이메일 주소" : "Email address")}{!entry.enabled ? (ko ? " · 비활성" : " · Disabled") : ""}</p></div><Button size="sm" disabled={unavailable} onClick={() => setPending({ removeId: entry.id })}>{ko ? "차단 해제" : "Unblock"}</Button></li>)}</ul>
    </SettingsPanel>
    {pending ? <ConfirmDialog tone="warning" title={"add" in pending ? (ko ? "발신자를 차단할까요?" : "Block this sender?") : t("confirm.unblockSender")} description={"add" in pending ? `${pending.add.value} — ${ko ? "앞으로 수신되는 메일을 스팸함으로 보냅니다." : "Future messages will go to Spam."}` : (ko ? "해제 이후 수신되는 메일에는 이 차단 규칙을 적용하지 않습니다." : "This blocking rule will no longer apply to future messages.")} confirmLabel={ko ? "적용" : "Apply"} onCancel={() => setPending(null)} onConfirm={() => void save()} /> : null}
  </>;
}
