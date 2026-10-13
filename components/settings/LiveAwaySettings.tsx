"use client";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Switch } from "@/components/ui/Switch";
import { emptyAdvancedRules, makeAwaySource, readAwaySource, replaceManagedAwayRule, validAwayDraft, type AwayDraft } from "@/lib/away-rule";
import { clientMailFailure, clientMutationFailure } from "@/lib/tastemail/client-session-status";
import type { LiveMailRules } from "@/lib/tastemail/mail-rules";
import { SettingsHeaderTitle } from "./SettingsHeaderTitle";
import { SettingsPageIntro, SettingsPanel, SettingRow } from "./SettingsPrimitives";

type Status = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
const EMPTY: AwayDraft = { subject: "", message: "", enabled: false };
const statuses = new Set(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]);
function snapshot(payload: unknown): LiveMailRules {
  if (!payload || typeof payload !== "object" || !("revision" in payload) || typeof payload.revision !== "number" ||
    !("mode" in payload) || typeof payload.mode !== "string" || !("source" in payload) || typeof payload.source !== "string" ||
    !("enabled" in payload) || typeof payload.enabled !== "boolean" || !("rules" in payload) || !Array.isArray(payload.rules) ||
    payload.rules.some((rule: unknown) => !rule || typeof rule !== "object" || !("id" in rule) || typeof rule.id !== "string" ||
      !("source" in rule) || typeof rule.source !== "string" || !("kind" in rule) || typeof rule.kind !== "string" ||
      !("enabled" in rule) || typeof rule.enabled !== "boolean")) throw new Error("unavailable");
  return payload as LiveMailRules;
}

export function LiveAwaySettings({ embedded = false }: { embedded?: boolean } = {}) {
  const settings = useTranslations("settingsSystem");
  const away = useTranslations("awayLive");
  const service = useTranslations("liveService");
  const title = settings("nav.away");
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<LiveMailRules | null>(null);
  const [draft, setDraft] = useState<AwayDraft>(EMPTY);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const savingRef = useRef(false);
  const saveBlockedRef = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/rules", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(clientMailFailure(response.status, payload));
        return snapshot(payload);
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        const managed = result.rules.find((rule) => rule.kind === "vacation" && readAwaySource(rule.source));
        const parsed = managed && readAwaySource(managed.source);
        setData(result);
        setDraft(parsed ? { ...parsed, enabled: managed.enabled } : EMPTY);
        setFeedback("");
        setUncertain(false);
        saveBlockedRef.current = false;
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setStatus(statuses.has(reason) ? reason as Status : "retryable");
      });
    return () => controller.abort();
  }, [attempt]);

  const managed = data?.rules.find((rule) => rule.kind === "vacation" && readAwaySource(rule.source));
  const otherVacation = data?.rules.some((rule) => rule !== managed && /\bvacation\b/iu.test(rule.source)) ?? false;
  const editable = Boolean(data && (data.mode === "rules" || emptyAdvancedRules(data)) && !otherVacation && (managed || data.rules.length < 50));
  const original = managed && readAwaySource(managed.source);
  const dirty = Boolean(data && editable && (managed
    ? draft.enabled !== managed.enabled || draft.subject !== original?.subject || draft.message !== original?.message
    : draft.enabled || draft.subject || draft.message));

  useEffect(() => {
    if (!dirty) return;
    const warning = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warning);
    return () => window.removeEventListener("beforeunload", warning);
  }, [dirty]);

  const reload = () => {
    if (savingRef.current) return;
    saveBlockedRef.current = true;
    setStatus("loading"); setAttempt((value) => value + 1);
  };
  const save = async () => {
    if (!data || !editable || !dirty || status !== "ready" || savingRef.current || saveBlockedRef.current || uncertain) return;
    if (!validAwayDraft(draft)) { setFeedback(away("invalid")); return; }
    let source: string;
    try { source = makeAwaySource(draft); } catch { setFeedback(away("invalid")); return; }
    if (!window.confirm(away("saveNotice"))) return;
    savingRef.current = true;
    setSaving(true);
    setFeedback("");
    let writeStarted = false;
    try {
      const check = await fetch("/api/mail/rules/check", {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ intent: "validate", source }),
      });
      const checked: unknown = await check.json().catch(() => null);
      if (!check.ok) throw new Error(clientMutationFailure(check.status, checked));
      if (!checked || typeof checked !== "object" || Array.isArray(checked) || !("valid" in checked) || checked.valid !== true) {
        throw new Error("unavailable");
      }
      const rules = replaceManagedAwayRule(data.rules, managed?.id ?? null, source, draft.enabled, away("ruleName"));
      writeStarted = true;
      const response = await fetch("/api/mail/rules", {
        method: "PUT", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ expectedRevision: data.revision, rules }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(clientMutationFailure(response.status, payload));
      const saved = snapshot(payload);
      const savedRule = saved.rules.find((rule) => rule.kind === "vacation" && readAwaySource(rule.source));
      const savedDraft = savedRule && readAwaySource(savedRule.source);
      const expectedDraft = readAwaySource(source);
      if (!savedRule || !savedDraft || !expectedDraft || saved.revision <= data.revision ||
          (managed && savedRule.id !== managed.id) || savedRule.enabled !== draft.enabled ||
          savedDraft.subject !== expectedDraft.subject || savedDraft.message !== expectedDraft.message) {
        throw new Error("unavailable");
      }
      setData(saved);
      setDraft({ ...savedDraft, enabled: savedRule.enabled });
      setFeedback(away("saved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "retryable";
      const reason = statuses.has(message) || message === "conflict" || message === "invalid_request" ? message : "retryable";
      if (reason === "conflict" || writeStarted && (reason === "retryable" || reason === "unavailable")) {
        saveBlockedRef.current = true;
        setUncertain(true);
        setFeedback(away(reason === "conflict" ? "conflict" : "uncertain"));
      } else setFeedback(reason === "invalid_request" ? away("invalid") : statuses.has(reason) ? service(reason as Status) : service("unavailable"));
    } finally { savingRef.current = false; setSaving(false); }
  };

  const content = <>
    <section aria-label={title} aria-busy={saving} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-7">
      <div className="mx-auto max-w-4xl space-y-5">
        <SettingsPageIntro title={title} description={away("description")} />
        {status === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p> : null}
        {status !== "loading" && status !== "ready" ? <SystemErrorNotice message={service(status)} actionLabel={service("retry")} onAction={reload} className="rounded-(--radius-app) border border-(--border-app) bg-background p-5" /> : null}
        {status === "ready" && data ? <>
          {!editable ? <div role="note" className="rounded-(--radius-app) border border-(--status-warning) bg-(--status-warning-bg) p-4 text-sm"><p>{data.mode !== "rules" ? away("legacyMode") : otherVacation ? away("customRule") : away("ruleLimit")}</p><Link href="/settings/rules" className="mt-2 inline-block font-medium text-(--color-primary-ink) underline">{away("openRules")}</Link></div> : <>
            <p className="text-sm text-(--text-muted)">{away("limits")}</p>
            <SettingsPanel title={title}>
              <SettingRow title={settings("fields.awayEnabled")}><Switch on={draft.enabled} disabled={saving || uncertain} onToggle={() => setDraft((value) => ({ ...value, enabled: !value.enabled }))} label={settings("fields.awayEnabled")} /></SettingRow>
              <Input label={settings("fields.subject")} disabled={saving || uncertain} maxLength={120} value={draft.subject} onChange={(event) => setDraft((value) => ({ ...value, subject: event.target.value }))} />
              <Textarea label={away("message")} disabled={saving || uncertain} maxLength={8192} rows={8} value={draft.message} onChange={(event) => setDraft((value) => ({ ...value, message: event.target.value }))} />
            </SettingsPanel>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={!dirty || saving || uncertain || !validAwayDraft(draft)} onClick={save}>{saving ? away("saving") : settings("common.save")}</Button>
              {dirty && !uncertain ? <Button variant="secondary" disabled={saving} onClick={() => { if (window.confirm(away("discardNotice"))) { setDraft(original && managed ? { ...original, enabled: managed.enabled } : EMPTY); setFeedback(""); } }}>{settings("common.cancel")}</Button> : null}
              {uncertain ? <Button variant="secondary" onClick={() => { if (window.confirm(away("reloadNotice"))) reload(); }}>{away("reload")}</Button> : null}
              {feedback ? <p role="status" className="text-sm">{feedback}</p> : null}
            </div>
          </>}
        </> : null}
      </div>
    </section>
  </>;
  return embedded ? content : <WorkspaceLayout title={<SettingsHeaderTitle title={title} />} titleAsHeading={false} showGlobalSearch={false} className="flex flex-col bg-(--surface-muted)">{content}</WorkspaceLayout>;
}
