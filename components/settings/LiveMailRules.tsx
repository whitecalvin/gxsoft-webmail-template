"use client";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SettingsPageIntro } from "./SettingsPrimitives";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { clientMailFailure, clientMutationFailure } from "@/lib/tastemail/client-session-status";
import { SettingsHeaderTitle } from "./SettingsHeaderTitle";
import { Modal } from "@/components/overlay/Modal";
import { mailRuleFromSender } from "@/lib/mail-rule-from-message";
import { parseSimpleMailRule, simpleRuleMoveReady } from "@/lib/simple-mail-rule";
import { useMail } from "@/context/mail-context";
import { MailRuleVisualEditor } from "./MailRuleVisualEditor";
import { MailRuleSidebar } from "./MailRuleSidebar";
import { MailRuleApplication } from "./MailRuleApplication";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { importMailRules, exportMailRules, type TransferRule } from "@/lib/mail-rule-transfer";
import type { LiveMailRules, LiveMailRulePreview, MailRuleInput } from "@/lib/tastemail/mail-rules";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
const ERRORS = new Set<LoadStatus>(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]);
const REQUEST_ERRORS = new Set([...ERRORS, "invalid_request", "conflict", "not_found"]);
const requestFailureReason = (error: unknown) => error instanceof Error && REQUEST_ERRORS.has(error.message) ? error.message : "retryable";
type RuleDraft = MailRuleInput & { key: string };
type RuleCheck = { key: string; source: string; intent: "validate" | "preview"; sample: string; envelopeFrom: string; message: string; preview?: LiveMailRulePreview };
const SAMPLE_MESSAGE = "From: sender@example.test\r\nTo: recipient@example.test\r\nSubject: Sample message\r\n\r\nSample body";
const persistedRules = (data: LiveMailRules): RuleDraft[] => data.rules.map((rule) => ({
  key: rule.id, id: rule.id, name: rule.name, kind: rule.kind, source: rule.source, enabled: rule.enabled,
}));
const serializedRules = (rules: RuleDraft[]) => JSON.stringify(rules.map(({ id, name, kind, source, enabled }) => ({ id, name, kind, source, enabled })));

export function LiveMailRules({ embedded = false, sender, onClose }: { embedded?: boolean; sender?: string; onClose?: () => void } = {}) {
  const settings = useTranslations("settingsSystem");
  const live = useTranslations("rulesLive");
  const service = useTranslations("liveService");
  const common = useTranslations("common");
  const designer = useTranslations("ruleDesigner");
  const manager = useTranslations("ruleManager");
  const { mailboxes, mailboxSummaryStatus } = useMail();
  const locale = useLocale();
  const title = settings("nav.filters");
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<LiveMailRules | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drafts, setDrafts] = useState<RuleDraft[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applicationLocked, setApplicationLocked] = useState(false);
  const [saveUncertain, setSaveUncertain] = useState(false);
  const savingRef = useRef(false);
  const [saveConfirmation, setSaveConfirmation] = useState(false);
  const saveConfirmationRef = useRef(false);
  const saveUncertainRef = useRef(false);
  const [feedback, setFeedback] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<RuleCheck | null>(null);
  const [sampleMessage, setSampleMessage] = useState(SAMPLE_MESSAGE);
  const [envelopeFrom, setEnvelopeFrom] = useState("sender@example.test");
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [discardIntent, setDiscardIntent] = useState<"close" | "reset" | "reload" | null>(null);
  const discardIntentRef = useRef<"close" | "reset" | "reload" | null>(null);
  const [importPreview, setImportPreview] = useState<TransferRule[] | null>(null);
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const importEpoch = useRef(0);
  useEffect(() => () => { importEpoch.current += 1; }, []);
  const currentRules = useRef({ drafts, locked: saving || saveUncertain });
  useEffect(() => { currentRules.current = { drafts, locked: saving || saveUncertain }; }, [drafts, saving, saveUncertain]);
  const acceptedImport = useRef<TransferRule[] | null>(null);
  const seeded = useRef(false);
  const newRuleName = live("newName");

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]);
    fetch("/api/mail/rules", { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        if (!payload || typeof payload !== "object" || !("rules" in payload) || !Array.isArray(payload.rules)) throw new Error("unavailable");
        return payload as LiveMailRules;
      })
      .then((rules) => {
        if (controller.signal.aborted) return;
        setData(rules);
        const initial = sender && !seeded.current ? mailRuleFromSender(sender, newRuleName) : null;
        seeded.current = true;
        if (initial && rules.rules.length < 50) {
          const key = crypto.randomUUID();
          setDrafts([...persistedRules(rules), { ...initial, key }]);
          setSelectedKey(key);
          setFeedback(live("fromMessageNotice"));
        } else {
          setDrafts(persistedRules(rules));
          setSelectedKey((previous) => rules.rules.some((rule) => rule.id === previous) ? previous : rules.rules[0]?.id ?? null);
          if (initial) setFeedback(live("limitReached"));
          else if (sender) setFeedback(live("checkInvalid"));
        }
        setSaveUncertain(false);
        saveUncertainRef.current = false;
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setData(null);
        setStatus(ERRORS.has(reason as LoadStatus) ? reason as LoadStatus : "retryable");
      });
    return () => controller.abort();
  }, [attempt, sender, newRuleName, live]);

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dirty = data !== null && serializedRules(drafts) !== serializedRules(persistedRules(data));
  const requestDiscard = (intent: "close" | "reset" | "reload") => {
    if (savingRef.current || discardIntentRef.current) return;
    discardIntentRef.current = intent;
    setDiscardIntent(intent);
  };
  const cancelDiscard = () => {
    discardIntentRef.current = null;
    setDiscardIntent(null);
  };
  const confirmDiscard = () => {
    const intent = discardIntentRef.current;
    if (!intent || savingRef.current || intent === "reset" && saveUncertainRef.current) return;
    // Consume the pending action before applying it; double clicks cannot
    // trigger another close/reload or discard subsequent edits.
    cancelDiscard();
    if (intent === "close") { onClose?.(); return; }
    if (intent === "reload") {
      importEpoch.current += 1;
      importingRef.current = false;
      setImporting(false); setImportPreview(null); setDeleteKey(null);
      setStatus("loading"); setAttempt(value => value + 1);
      return;
    }
    if (data) {
      setDrafts(persistedRules(data)); setSelectedKey(data.rules[0]?.id ?? null);
      setFeedback(""); setCheckResult(null);
    }
  };
  const close = () => {
    if (savingRef.current || applicationLocked) return;
    if (dirty || saveUncertainRef.current) { requestDiscard("close"); return; }
    onClose?.();
  };
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);
  const selected = drafts.find((rule) => rule.key === selectedKey) ?? drafts[0] ?? null;
  const update = (key: string, patch: Partial<RuleDraft>) => {
    if (savingRef.current || saveUncertainRef.current) return;
    setDrafts((current) => current.map((rule) => rule.key === key ? { ...rule, ...patch } : rule));
  };
  const add = () => {
    if (savingRef.current || saveUncertainRef.current || drafts.length >= 50) return;
    const key = crypto.randomUUID();
    setDrafts((current) => [...current, { key, id: null, name: live("newName"), kind: "filter", source: "keep;", enabled: false }]);
    setSelectedKey(key);
    setFeedback("");
  };
  const move = (offset: -1 | 1) => {
    if (savingRef.current || saveUncertainRef.current || !selected) return;
    const index = drafts.findIndex((rule) => rule.key === selected.key);
    const target = index + offset;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    [next[index], next[target]] = [next[target], next[index]];
    setDrafts(next);
  };
  const duplicate = () => {
    if (!selected || savingRef.current || saveUncertainRef.current || drafts.length >= 50) return;
    const key = crypto.randomUUID();
    const copy = { ...selected, key, id: null, enabled: false, name: `${selected.name} (${manager("duplicate")})`.slice(0, 120) };
    setDrafts(current => { const next = [...current]; next.splice(next.findIndex(rule => rule.key === selected.key) + 1, 0, copy); return next; });
    setSelectedKey(key);
    setCheckResult(null);
  };
  const importFile = async (file: File) => {
    if (importingRef.current || savingRef.current || saveUncertainRef.current || importPreview) return;
    importingRef.current = true; setImporting(true);
    const epoch = importEpoch.current;
    try {
      if (file.size > 4_000_000) throw new Error("invalid_request");
      const text = await file.text();
      if (epoch !== importEpoch.current || currentRules.current.locked || savingRef.current || saveUncertainRef.current) return;
      setImportPreview(importMailRules(text, 50 - currentRules.current.drafts.length));
    } catch { if (epoch === importEpoch.current) setFeedback(manager("importInvalid")); }
    finally { if (epoch === importEpoch.current) { importingRef.current = false; setImporting(false); } }
  };
  const acceptImport = () => {
    if (!importPreview || acceptedImport.current === importPreview || savingRef.current || saveUncertainRef.current || currentRules.current.drafts.length + importPreview.length > 50) return;
    acceptedImport.current = importPreview;
    const added = importPreview.map(rule => ({ ...rule, key: crypto.randomUUID() }));
    setDrafts(current => [...current, ...added]);
    setSelectedKey(added[0].key); setImportPreview(null); setCheckResult(null);
    setFeedback(manager("importNotice"));
  };
  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([exportMailRules(drafts)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "tastemail-rules.json";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const checkRule = async (intent: "validate" | "preview") => {
    if (!selected || checking) return;
    const source = selected.source;
    const key = selected.key;
    setChecking(true);
    setCheckResult(null);
    try {
      const response = await fetch("/api/mail/rules/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify(intent === "validate" ? { intent, source } :
          { intent, source, rawMessage: sampleMessage, envelopeFrom: envelopeFrom.trim() || null }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(clientMutationFailure(response.status, payload));
      }
      if (!payload || typeof payload !== "object" || intent === "validate" && !("valid" in payload) ||
          intent === "preview" && !("deliveries" in payload)) throw new Error("unavailable");
      setCheckResult({ key, source, intent, sample: sampleMessage, envelopeFrom, message: live(intent === "validate" ? "syntaxValid" : "previewReady"),
        preview: intent === "preview" ? payload as LiveMailRulePreview : undefined });
    } catch (error) {
      const reason = requestFailureReason(error);
      setCheckResult({ key, source, intent, sample: sampleMessage, envelopeFrom,
        message: reason === "invalid_request" ? live("checkInvalid") : ERRORS.has(reason as LoadStatus) ? service(reason as LoadStatus) : service("unavailable") });
    } finally {
      setChecking(false);
    }
  };
  const save = async (confirmed = false) => {
    if (savingRef.current || saveUncertainRef.current || !data || !dirty || saving || saveUncertain || applicationLocked) return;
    if (drafts.some((rule) => !rule.name.trim() || [...rule.name.trim()].length > 120 || !rule.source.trim() || rule.source.length > 65_536)) {
      setFeedback(live("invalid"));
      return;
    }
    if (drafts.some(rule => !simpleRuleMoveReady(rule.source, mailboxSummaryStatus === "ready" ? mailboxes.map(mailbox => mailbox.name) : []))) {
      setFeedback(designer("destinationUnavailable"));
      return;
    }
    if (!confirmed) {
      saveConfirmationRef.current = true;
      setSaveConfirmation(true);
      return;
    }
    if (!saveConfirmationRef.current) return;
    // Consume confirmation before the request so repeated clicks cannot issue another PUT.
    saveConfirmationRef.current = false;
    setSaveConfirmation(false);
    savingRef.current = true;
    setSaving(true);
    setFeedback("");
    try {
      const response = await fetch("/api/mail/rules", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ expectedRevision: data.revision, rules: drafts.map(({ id, name, kind, source, enabled }) => ({ id, name: name.trim(), kind, source, enabled })) }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(clientMutationFailure(response.status, payload));
      }
      if (!payload || typeof payload !== "object" || !("rules" in payload) || !Array.isArray(payload.rules) ||
          !("revision" in payload) || typeof payload.revision !== "number") throw new Error("unavailable");
      const saved = payload as LiveMailRules;
      setData(saved);
      setDrafts(persistedRules(saved));
      setSelectedKey(saved.rules[0]?.id ?? null);
      setFeedback(live("saved"));
    } catch (error) {
      const reason = requestFailureReason(error);
      if (reason === "retryable" || reason === "unavailable" || reason === "conflict") {
        saveUncertainRef.current = true;
        setSaveUncertain(true);
        setFeedback(live(reason === "conflict" ? "conflict" : "uncertain"));
      } else {
        setFeedback(reason === "invalid_request" ? live("invalid") :
          ERRORS.has(reason as LoadStatus) ? service(reason as LoadStatus) : service("unavailable"));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const content = <>
    {!embedded ? <header className="workspace-page-header border-b border-(--border-app) bg-background px-4 sm:px-7"><h1 className="truncate text-sm font-semibold">{title}</h1></header> : null}
    <section aria-label={title} className={`min-h-0 min-w-0 ${embedded ? "" : "flex-1 overflow-y-auto p-4 sm:p-7"}`}>
      <div className={`mx-auto ${embedded ? "" : "max-w-5xl"}`}>
        {!embedded ? <SettingsPageIntro title={title} description={settings("descriptions.filters")} /> : <p className="text-sm leading-relaxed text-(--text-muted)">{settings("descriptions.filters")}</p>}
        {status === "loading" ? <p role="status" className="mt-6 text-sm text-(--text-muted)">{service("loading")}</p> : null}
        {status !== "loading" && status !== "ready" ? <SystemErrorNotice message={service(status)} actionLabel={service("retry")} onAction={() => { setStatus("loading"); setAttempt((value) => value + 1); }} className="mt-6 rounded-xl border border-(--border-app) bg-background p-5 text-sm" /> : null}
        {status === "ready" && data ? <>
          {feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}
          {saveUncertain ? <button type="button" onClick={() => requestDiscard("reload")} className="mt-2 rounded-lg border border-(--border-app) px-3 py-2 text-sm">{live("reload")}</button> : null}
          <div data-rule-manager className="mt-4 grid min-h-[28rem] overflow-hidden rounded-xl border border-(--border-app) bg-background lg:h-[min(65dvh,48rem)] lg:min-h-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <MailRuleSidebar rules={drafts} selected={selected} disabled={saving || saveUncertain || importing || !!importPreview} checking={checking} importing={importing}
              applicationLocked={applicationLocked} applicationPanel={<MailRuleApplication revision={data.revision} disabled={dirty || saving || saveUncertain || !data.enabled || importing || !!importPreview} triggerDisabled={applicationLocked} onLock={setApplicationLocked} />}
              renderApplication={key => {
                const draft = drafts.find(rule => rule.key === key);
                const saved = data.rules.find(rule => rule.id === draft?.id);
                return <MailRuleApplication icon rule={saved ? { id: saved.id, name: saved.name } : undefined} revision={data.revision}
                  disabled={dirty || saving || saveUncertain || !data.enabled || !saved?.enabled || importing || !!importPreview}
                  triggerDisabled={applicationLocked} onLock={setApplicationLocked} />;
              }}
              onSelect={setSelectedKey} onAdd={add} onMove={move} onCheck={() => { void checkRule("validate"); }} onDuplicate={duplicate}
              onDelete={() => { if (selected) setDeleteKey(selected.key); }} onToggle={() => { if (selected) update(selected.key, { enabled: !selected.enabled }); }}
              onImport={file => { void importFile(file); }} onExport={exportFile} />
            <section data-rule-editor inert={applicationLocked} aria-label={live("editor")} className="min-h-0 min-w-0 p-4 sm:p-6 lg:overflow-y-auto">
              {selected ? <fieldset disabled={saving || saveUncertain} className="min-w-0 space-y-4">
                <div className="border-b border-(--border-app) pb-3"><h2 className="break-words text-base font-semibold">{selected.name || live("newName")}</h2><p className="mt-1 text-xs text-(--text-muted)">{live(selected.kind)} · {live(selected.enabled ? "enabled" : "disabled")}</p></div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]"><Input label={live("name")} value={selected.name} maxLength={120} onChange={(event) => update(selected.key, { name: event.target.value })} />
                <label className="grid gap-1.5 text-sm font-medium">{live("kind")}<CustomSelect aria-label={live("kind")} align="right" disabled={saving || saveUncertain} value={selected.kind} onChange={(event) => update(selected.key, { kind: event.target.value as RuleDraft["kind"] })} className="app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm font-normal"><option value="filter">{live("filter")}</option><option value="vacation">{live("vacation")}</option><option value="advanced">{live("advanced")}</option></CustomSelect></label></div>
                <p className="text-xs text-(--text-muted)">{designer("enableHelp")}</p>
                {selected.kind === "filter" ? <MailRuleVisualEditor source={selected.source} disabled={saving || saveUncertain} mailboxes={mailboxes} mailboxesReady={mailboxSummaryStatus === "ready"} onChange={source => update(selected.key, { source })} /> : null}
                <details key={`${selected.key}:${selected.kind}:${Boolean(parseSimpleMailRule(selected.source))}`} open={selected.kind !== "filter" || !parseSimpleMailRule(selected.source)} className="rounded-lg border border-(--border-app) p-3 text-sm">
                  <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-(--focus-ring)">{designer("advanced")}</summary>
                  <label className="mt-3 block text-xs text-(--text-muted)">{live("source")}<textarea aria-label={live("source")} value={selected.source} maxLength={65536} rows={10} spellCheck={false} onChange={(event) => update(selected.key, { source: event.target.value })} className="mt-1 block w-full rounded-lg border border-(--border-app) bg-background p-3 font-mono text-xs text-foreground" /></label>
                </details>
                <details className="rounded-lg border border-(--border-app) p-3 text-sm"><summary className="cursor-pointer">{live("preview")}</summary>
                  <p className="mt-2 text-xs text-(--text-muted)">{live("previewNotice")}</p>
                  <label className="mt-3 block">{live("envelopeFrom")}<input type="email" value={envelopeFrom} onChange={(event) => setEnvelopeFrom(event.target.value)} className="mt-1 block w-full rounded-lg border border-(--border-app) bg-background p-2" /></label>
                  <label className="mt-3 block">{live("sampleMessage")}<textarea value={sampleMessage} maxLength={262144} rows={7} onChange={(event) => setSampleMessage(event.target.value)} className="mt-1 block w-full rounded-lg border border-(--border-app) bg-background p-2 font-mono text-xs" /></label>
                  <button type="button" disabled={checking || !sampleMessage.trim() || !selected.source.trim()} onClick={() => checkRule("preview")} className="mt-3 rounded-lg border border-(--border-app) px-3 py-2 disabled:opacity-50">{live("runPreview")}</button>
                </details>
                {checkResult?.key === selected.key && checkResult.source === selected.source &&
                  (checkResult.intent === "validate" || checkResult.sample === sampleMessage && checkResult.envelopeFrom === envelopeFrom) ?
                  <div role="status" className="rounded-lg border border-(--border-app) bg-(--surface-muted) p-3 text-sm">
                    <p>{checkResult.message}</p>
                    {checkResult.preview ? <dl className="mt-2 grid gap-1 sm:grid-cols-[7rem_1fr]">
                      <dt>{live("deliveries")}</dt><dd className="break-all">{checkResult.preview.deliveries.join(", ") || "—"}</dd>
                      <dt>{live("flags")}</dt><dd className="break-all">{checkResult.preview.flags.join(", ") || "—"}</dd>
                      <dt>{live("vacationResult")}</dt><dd>{checkResult.preview.vacation ? live("yes") : live("no")}</dd>
                      <dt>{live("rejection")}</dt><dd className="break-all">{checkResult.preview.rejection || "—"}</dd>
                      <dt>{live("stopped")}</dt><dd>{checkResult.preview.stopped ? live("yes") : live("no")}</dd>
                    </dl> : null}
                  </div> : null}
                {selected.id ? <p className="text-xs text-(--text-muted)">{data.rules.find((rule) => rule.id === selected.id)?.updatedAt ? dateFormat.format(new Date(data.rules.find((rule) => rule.id === selected.id)!.updatedAt)) : null}</p> : null}
              </fieldset> : <div data-rule-empty-state className="py-6"><p className="text-sm font-medium">{live("empty")}</p><p className="mt-2 text-sm text-(--text-muted)">{designer("emptyHelp")}</p></div>}
            </section>
          </div>
          {dirty || saveUncertain ? <div className="sticky bottom-0 z-10 mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-(--border-app) bg-(--surface-app) px-4 py-3 sm:px-6">
            <span aria-live="polite" className="mr-auto text-xs text-(--text-muted)">{drafts.length} / 50 · {dirty ? live("unsaved") : live("savedState")}</span>
            {dirty ? <Button disabled={saving || saveUncertain} onClick={() => requestDiscard("reset")}>{live("discard")}</Button> : null}
            <Button variant="primary" loading={saving} disabled={!dirty || saving || saveUncertain} onClick={() => save()}>{live("saveAll")}</Button>
          </div> : null}
        </> : null}
      </div>
    </section>
  </>;
  const dialogs = <>
    {saveConfirmation ? <ConfirmDialog tone="default" title={live("saveAll")} description={data?.mode === "rules" ? live("saveNotice") : live("modeConversion")} confirmLabel={live("saveAll")} cancelLabel={common("cancel")} confirmDisabled={saving || saveUncertain || !dirty}
      onConfirm={() => { void save(true); }} onCancel={() => { saveConfirmationRef.current = false; setSaveConfirmation(false); }} /> : null}
    {discardIntent ? <ConfirmDialog tone="default" title={live("discard")} description={live("discardNotice")} confirmLabel={live("discard")} cancelLabel={common("cancel")} confirmDisabled={saving}
      onConfirm={confirmDiscard} onCancel={cancelDiscard} /> : null}
    {deleteKey ? <ConfirmDialog tone="destructive" title={live("remove")} description={live("deleteNotice")} confirmLabel={live("remove")} confirmDisabled={saving || saveUncertain}
      onCancel={() => setDeleteKey(null)} onConfirm={() => { if (savingRef.current || saveUncertainRef.current) return; setDrafts(current => current.filter(rule => rule.key !== deleteKey)); setSelectedKey(null); setDeleteKey(null); setCheckResult(null); }} /> : null}
    {importPreview ? <ConfirmDialog tone="default" title={`${manager("import")} (${importPreview.length})`} description={manager("importNotice")} confirmLabel={manager("import")} confirmDisabled={saving || saveUncertain || drafts.length + importPreview.length > 50} onConfirm={acceptImport} onCancel={() => setImportPreview(null)} /> : null}
  </>;
  if (onClose) return <Modal ariaLabel={title} onClose={close} dismissible={!applicationLocked && !saving && !deleteKey && !importPreview && !discardIntent && !saveConfirmation} maxWidth={1100} className="flex max-h-[calc(100dvh-2rem)] flex-col">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--border-app) px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button size="sm" variant="ghost" disabled={saving} onClick={close}>{common("close")}</Button></header>
    <div className="min-h-0 overflow-y-auto p-4 sm:p-6">{content}</div>{dialogs}
  </Modal>;
  return embedded ? <>{content}{dialogs}</> : <WorkspaceLayout title={<SettingsHeaderTitle title={title} />} titleAsHeading={false} showGlobalSearch={false} className="flex flex-col bg-(--surface-muted)">{content}{dialogs}</WorkspaceLayout>;
}
