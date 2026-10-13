"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { Modal } from "@/components/overlay/Modal";
import { DialogActions } from "@/components/overlay/DialogActions";
import { Tooltip } from "@/components/ui/Tooltip";
import { Play } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { mailboxLabel } from "@/lib/mailbox-label";
import { parseRuleApplicationPlan, ruleApplicationId, type RuleApplicationPlan } from "@/lib/mail-rule-application";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";

// Preview never executes. After an uncertain execution, only the same plan is
// queried; a deliberate retry retains the original idempotency key.
export function MailRuleApplication({ revision, disabled, onLock, rule, icon = false, triggerDisabled = false }: { revision: number; disabled: boolean; onLock: (locked: boolean) => void; rule?: { id: string; name: string }; icon?: boolean; triggerDisabled?: boolean }) {
  const t = useTranslations("ruleApplication");
  const service = useTranslations("liveService");
  const folders = useTranslations("sidebar");
  const common = useTranslations("common");
  const title = icon ? `${t("applyOne")}: ${rule?.name ?? "—"}` : t("title");
  const unavailableScope = icon && !ruleApplicationId(rule?.id);
  const { mailboxes, mailboxSummaryStatus, refreshMailbox } = useMail();
  const eligible = mailboxes.filter(m => m.role !== "sent" && m.role !== "drafts");
  const [expanded, setExpanded] = useState(false);
  const [mailboxId, setMailboxId] = useState("");
  const [plan, setPlan] = useState<RuleApplicationPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [trashConfirmed, setTrashConfirmed] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const key = useRef<string | null>(null);
  const confirmedPlan = useRef<string | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expanded]);
  const selectedId = mailboxId || eligible.find(m => m.role === "inbox")?.id || eligible[0]?.id || "";
  const canExecute = !disabled && !unavailableScope && !busy && !uncertain && plan?.status === "planned" && plan.ruleId === rule?.id && !plan.blockers.length && plan.ruleRevision === revision && Date.parse(plan.expiresAt) > now && (!plan.requiresTrashConfirmation || trashConfirmed);
  function close() {
    if (pending.current || uncertain || confirmation) return;
    setExpanded(false); onLock(false);
    // 목록의 inert 해제 이후 적용 버튼으로 키보드 포커스를 복원합니다.
    requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); });
  }

  async function request(intent: "preview" | "execute" | "result") {
    if (pending.current || intent !== "result" && (disabled || unavailableScope)) return;
    if (intent === "execute" && (!plan || !canExecute || confirmedPlan.current !== plan.id || !key.current || Date.parse(plan.expiresAt) <= Date.now())) return;
    if (intent === "preview" && (uncertain || !selectedId)) return;
    if (intent !== "preview" && !plan) return;
    confirmedPlan.current = null;
    setConfirmation(false);
    pending.current = true;
    setBusy(true); onLock(true); setError("");
    const previous = plan;
    let outcomeUncertain = uncertain;
    if (intent === "preview") { setPlan(null); key.current = null; setTrashConfirmed(false); }
    try {
      const response = await fetch(intent === "result" ? `/api/mail/rules/apply?planId=${encodeURIComponent(previous!.id)}` : "/api/mail/rules/apply", {
        method: intent === "result" ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(30_000),
        ...(intent === "result" ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(intent === "preview" ?
          { intent, mailboxId: selectedId, expectedRevision: revision, ...(rule ? { ruleId: rule.id } : {}) } :
          { intent, planId: previous!.id, idempotencyKey: key.current, confirmed: true, confirmTrash: trashConfirmed }) }),
      });
      if (!response.ok) throw new Error(response.status === 413 ? "limit" : response.status === 409 ? "conflict" :
        [401, 403, 429].includes(response.status) || response.status >= 500 ? clientMailFailure(response.status, null) : "failed");
      const received = parseRuleApplicationPlan(await response.json());
      // 미리보기·실행·결과 조회 모두 동일한 편지함 및 규칙 범위의 영수증만 받습니다.
      if (intent === "preview" ? received.mailboxId !== selectedId || received.ruleRevision !== revision || received.ruleId !== rule?.id :
        received.id !== previous!.id || received.mailboxId !== previous!.mailboxId || received.ruleRevision !== previous!.ruleRevision || received.ruleId !== previous!.ruleId) throw new Error("failed");
      if (intent === "execute" && received.status !== "completed") throw new Error("failed");
      outcomeUncertain = false;
      setPlan(received); setUncertain(false);
      if (intent === "preview") key.current = crypto.randomUUID();
      if (received.status === "completed") refreshMailbox();
    } catch (failure) {
      if (intent === "execute" || intent === "result") {
        outcomeUncertain = true;
        setUncertain(true);
      }
      setError(failure instanceof Error && ["limit", "conflict", "unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(failure.message) ? failure.message : "failed");
    } finally {
      pending.current = false; setBusy(false);
      // 결과 조회가 성공할 때까지 부모 편집·닫기를 잠가 같은 계획을 보존합니다.
      onLock(expanded || outcomeUncertain);
    }
  }

  return <section className="text-sm">
    {icon ? <Tooltip content={disabled || unavailableScope ? `${title} · ${t("saveFirst")}` : title} className="shrink-0"><span className="inline-flex" tabIndex={disabled || unavailableScope ? 0 : undefined}><Button ref={trigger} data-rule-apply size="icon" variant="ghost" aria-label={title} aria-haspopup="dialog" disabled={disabled || unavailableScope || triggerDisabled} onClick={() => { setExpanded(true); onLock(true); }}><Play size={16} /></Button></span></Tooltip> :
      <Button ref={trigger} variant="secondary" size="sm" disabled={triggerDisabled} onClick={() => { setExpanded(true); onLock(true); }} aria-haspopup="dialog" aria-expanded={expanded}>{title}</Button>}
    {expanded && !confirmation ? createPortal(<Modal ariaLabel={title} onClose={close} dismissible={!busy && !uncertain && !confirmation} maxWidth={640} className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <header className="shrink-0 border-b border-(--border-app) px-4 py-4 sm:px-6"><h2 className="text-base font-semibold">{title}</h2></header>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4 sm:px-6" inert={confirmation}>
      <p className="text-xs text-(--text-muted)">{disabled ? t("saveFirst") : t("scope")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1.5">{t("mailbox")}<CustomSelect aria-label={t("mailbox")} value={selectedId} disabled={busy || uncertain || disabled || unavailableScope || mailboxSummaryStatus !== "ready"} onChange={event => { setMailboxId(event.target.value); setPlan(null); setTrashConfirmed(false); }} className="app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm">
          {!selectedId ? <option value="">—</option> : null}
          {eligible.map(m => <option key={m.id} value={m.id}>{mailboxLabel(m.role, m.name, folders)}</option>)}
        </CustomSelect></label>
        <Button disabled={disabled || unavailableScope || busy || uncertain || !selectedId || mailboxSummaryStatus !== "ready"} loading={busy} onClick={() => { void request("preview"); }}>{t("preview")}</Button>
      </div>
      {error ? <p role="alert">{["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(error)
        ? service(error as "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable")
        : t(error as "failed" | "limit" | "conflict")}</p> : null}
      {plan ? <div className="space-y-2" aria-live="polite">
        <p>{t("count", { count: plan.targetCount })} · {t(plan.status)}</p>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
          {Object.entries(plan.actionCounts).map(([action, count]) => {
            const destination = action.startsWith("fileinto:") ? action.slice(9) : null;
            const mailbox = mailboxes.find(m => m.name === destination);
            return <div key={action} className="contents"><dt>{destination ? t("move", { mailbox: mailbox ? mailboxLabel(mailbox.role, mailbox.name, folders) : destination }) : t(action as "keep" | "trash")}</dt><dd className="tabular-nums">{count}</dd></div>;
          })}
        </dl>
        {plan.blockers.length ? <p role="alert">{t("blockers")}</p> : null}
        {plan.requiresTrashConfirmation && plan.status === "planned" ? <label className="flex items-start gap-2"><input type="checkbox" checked={trashConfirmed} disabled={busy || uncertain} onChange={event => setTrashConfirmed(event.target.checked)} />{t("trashWarning")}</label> : null}
        {uncertain ? <p role="alert">{t("uncertain")}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!canExecute} onClick={() => { if (!canExecute) return; confirmedPlan.current = plan.id; setConfirmation(true); }}>{t("execute")}</Button>
          <Button disabled={busy} onClick={() => { void request("result"); }}>{t("result")}</Button>
        </div>
      </div> : null}
      </div>
      <footer className="shrink-0 border-t border-(--border-app) px-4 py-3 sm:px-6"><DialogActions><Button disabled={busy || uncertain || confirmation} onClick={close}>{common("close")}</Button></DialogActions></footer>
    </Modal>, document.body) : null}
    {confirmation ? <ConfirmDialog tone={plan?.requiresTrashConfirmation ? "warning" : "default"} title={icon ? title : t("execute")} description={t("confirm")} confirmLabel={t("execute")} cancelLabel={common("cancel")} confirmDisabled={!canExecute} onConfirm={() => { void request("execute"); }} onCancel={() => { confirmedPlan.current = null; setConfirmation(false); }} /> : null}
  </section>;
}
