"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SettingsHeaderTitle } from "./SettingsHeaderTitle";
import { SettingsNav } from "./SettingsNav";
import type { LiveMailRules, LiveMailRulePreview, MailRuleInput } from "@/lib/tastemail/mail-rules";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
const ERRORS = new Set<LoadStatus>(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]);
type RuleDraft = MailRuleInput & { key: string };
type RuleCheck = { key: string; source: string; intent: "validate" | "preview"; sample: string; envelopeFrom: string; message: string; preview?: LiveMailRulePreview };
const SAMPLE_MESSAGE = "From: sender@example.test\r\nTo: recipient@example.test\r\nSubject: Sample message\r\n\r\nSample body";
const persistedRules = (data: LiveMailRules): RuleDraft[] => data.rules.map((rule) => ({
  key: rule.id, id: rule.id, name: rule.name, kind: rule.kind, source: rule.source, enabled: rule.enabled,
}));
const serializedRules = (rules: RuleDraft[]) => JSON.stringify(rules.map(({ id, name, kind, source, enabled }) => ({ id, name, kind, source, enabled })));

export function LiveMailRules() {
  const settings = useTranslations("settingsSystem");
  const live = useTranslations("rulesLive");
  const service = useTranslations("liveService");
  const locale = useLocale();
  const title = settings("nav.filters");
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<LiveMailRules | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drafts, setDrafts] = useState<RuleDraft[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveUncertain, setSaveUncertain] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<RuleCheck | null>(null);
  const [sampleMessage, setSampleMessage] = useState(SAMPLE_MESSAGE);
  const [envelopeFrom, setEnvelopeFrom] = useState("sender@example.test");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/rules", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof reason === "string" ? reason : "retryable");
        }
        if (!payload || typeof payload !== "object" || !("rules" in payload) || !Array.isArray(payload.rules)) throw new Error("unavailable");
        return payload as LiveMailRules;
      })
      .then((rules) => {
        if (controller.signal.aborted) return;
        setData(rules);
        setDrafts(persistedRules(rules));
        setSelectedKey((previous) => rules.rules.some((rule) => rule.id === previous) ? previous : rules.rules[0]?.id ?? null);
        setSaveUncertain(false);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setData(null);
        setStatus(ERRORS.has(reason as LoadStatus) ? reason as LoadStatus : "retryable");
      });
    return () => controller.abort();
  }, [attempt]);

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dirty = data !== null && serializedRules(drafts) !== serializedRules(persistedRules(data));
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
  const update = (key: string, patch: Partial<RuleDraft>) => setDrafts((current) => current.map((rule) => rule.key === key ? { ...rule, ...patch } : rule));
  const add = () => {
    if (drafts.length >= 50) return;
    const key = crypto.randomUUID();
    setDrafts((current) => [...current, { key, id: null, name: live("newName"), kind: "filter", source: "keep;", enabled: false }]);
    setSelectedKey(key);
    setFeedback("");
  };
  const move = (offset: -1 | 1) => {
    if (!selected) return;
    const index = drafts.findIndex((rule) => rule.key === selected.key);
    const target = index + offset;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    [next[index], next[target]] = [next[target], next[index]];
    setDrafts(next);
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
        body: JSON.stringify(intent === "validate" ? { intent, source } :
          { intent, source, rawMessage: sampleMessage, envelopeFrom: envelopeFrom.trim() || null }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" ? reason : "retryable");
      }
      if (!payload || typeof payload !== "object" || intent === "validate" && !("valid" in payload) ||
          intent === "preview" && !("deliveries" in payload)) throw new Error("unavailable");
      setCheckResult({ key, source, intent, sample: sampleMessage, envelopeFrom, message: live(intent === "validate" ? "syntaxValid" : "previewReady"),
        preview: intent === "preview" ? payload as LiveMailRulePreview : undefined });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      setCheckResult({ key, source, intent, sample: sampleMessage, envelopeFrom,
        message: reason === "invalid_request" ? live("checkInvalid") : ERRORS.has(reason as LoadStatus) ? service(reason as LoadStatus) : service("unavailable") });
    } finally {
      setChecking(false);
    }
  };
  const save = async () => {
    if (!data || !dirty || saving || saveUncertain) return;
    if (drafts.some((rule) => !rule.name.trim() || [...rule.name.trim()].length > 120 || !rule.source.trim() || rule.source.length > 65_536)) {
      setFeedback(live("invalid"));
      return;
    }
    if (!window.confirm(data.mode === "rules" ? live("saveNotice") : live("modeConversion"))) return;
    setSaving(true);
    setFeedback("");
    try {
      const response = await fetch("/api/mail/rules", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: data.revision, rules: drafts.map(({ id, name, kind, source, enabled }) => ({ id, name: name.trim(), kind, source, enabled })) }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" ? reason : "retryable");
      }
      if (!payload || typeof payload !== "object" || !("rules" in payload) || !Array.isArray(payload.rules) ||
          !("revision" in payload) || typeof payload.revision !== "number") throw new Error("unavailable");
      const saved = payload as LiveMailRules;
      setData(saved);
      setDrafts(persistedRules(saved));
      setSelectedKey(saved.rules[0]?.id ?? null);
      setFeedback(live("saved"));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      if (reason === "retryable" || reason === "unavailable" || reason === "conflict") {
        setSaveUncertain(true);
        setFeedback(live(reason === "conflict" ? "conflict" : "uncertain"));
      } else {
        setFeedback(reason === "invalid_request" ? live("invalid") :
          ERRORS.has(reason as LoadStatus) ? service(reason as LoadStatus) : service("unavailable"));
      }
    } finally {
      setSaving(false);
    }
  };

  return <WorkspaceLayout title={<SettingsHeaderTitle title={title} />} titleAsHeading={false} showGlobalSearch={false} className="flex flex-col bg-(--surface-muted) lg:flex-row">
    <SettingsNav active="filters" />
    <section aria-label={title} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-7">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-(--text-muted)">{live("readOnly")}</p>
        {status === "loading" ? <p role="status" className="mt-6 text-sm text-(--text-muted)">{service("loading")}</p> : null}
        {status !== "loading" && status !== "ready" ? <div role="alert" className="mt-6 rounded-xl border border-(--border-app) bg-background p-5 text-sm">
          <p>{service(status)}</p>
          <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }} className="mt-3 rounded-lg border border-(--border-app) px-3 py-2">{service("retry")}</button>
        </div> : null}
        {status === "ready" && data ? <>
          <p className="mt-5 text-xs text-(--text-muted)">{live("revision", { revision: data.revision })} · {data.enabled ? live("enabled") : live("disabled")}</p>
          {data.mode !== "rules" ? <p role="note" className="mt-3 rounded-lg border border-(--border-app) bg-background p-3 text-sm">{live("modeConversion")}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" disabled={drafts.length >= 50 || saving} onClick={add} className="rounded-lg border border-(--border-app) bg-background px-3 py-2 text-sm disabled:opacity-50">{live("add")}</button>
            <button type="button" disabled={!dirty || saving || saveUncertain} onClick={save} className="rounded-lg bg-(--color-primary-solid) px-3 py-2 text-sm text-white disabled:opacity-50">{live("saveAll")}</button>
            {dirty ? <button type="button" disabled={saving} onClick={() => { if (window.confirm(live("discardNotice"))) { setDrafts(persistedRules(data)); setSelectedKey(data.rules[0]?.id ?? null); setFeedback(""); setSaveUncertain(false); } }} className="rounded-lg border border-(--border-app) px-3 py-2 text-sm">{live("discard")}</button> : null}
            <span className="text-xs text-(--text-muted)">{drafts.length} / 50 · {dirty ? live("unsaved") : live("savedState")}</span>
          </div>
          {feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}
          {saveUncertain ? <button type="button" onClick={() => { if (window.confirm(live("discardNotice"))) { setStatus("loading"); setAttempt((value) => value + 1); } }} className="mt-2 rounded-lg border border-(--border-app) px-3 py-2 text-sm">{live("reload")}</button> : null}
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(12rem,0.35fr)_minmax(0,1fr)]">
            <nav aria-label={title} className="min-w-0 rounded-xl border border-(--border-app) bg-background p-3">
              {drafts.length === 0 ? <p className="p-2 text-sm text-(--text-muted)">{live("empty")}</p> : null}
              <ol className="space-y-1">{drafts.map((rule, index) => <li key={rule.key}><button type="button" aria-current={selected?.key === rule.key ? "true" : undefined} onClick={() => setSelectedKey(rule.key)} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-(--surface-muted) aria-current:bg-(--color-primary)/10">{index + 1}. {rule.name || live("newName")} · {live(rule.kind)}</button></li>)}</ol>
            </nav>
            <section aria-label={live("editor")} className="min-w-0 rounded-xl border border-(--border-app) bg-background p-4">
              {selected ? <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={saving || drafts[0]?.key === selected.key} onClick={() => move(-1)} className="rounded-lg border border-(--border-app) px-3 py-1 text-sm disabled:opacity-50">{live("moveUp")}</button>
                  <button type="button" disabled={saving || drafts.at(-1)?.key === selected.key} onClick={() => move(1)} className="rounded-lg border border-(--border-app) px-3 py-1 text-sm disabled:opacity-50">{live("moveDown")}</button>
                  <button type="button" disabled={saving} onClick={() => { if (window.confirm(live("deleteNotice"))) { setDrafts((current) => current.filter((rule) => rule.key !== selected.key)); setSelectedKey(null); } }} className="rounded-lg border border-(--border-app) px-3 py-1 text-sm text-(--status-danger)">{live("remove")}</button>
                </div>
                <label className="block text-sm">{live("name")}<input value={selected.name} maxLength={120} onChange={(event) => update(selected.key, { name: event.target.value })} className="mt-1 block w-full rounded-lg border border-(--border-app) bg-background p-2" /></label>
                <label className="block text-sm">{live("kind")}<select value={selected.kind} onChange={(event) => update(selected.key, { kind: event.target.value as RuleDraft["kind"] })} className="mt-1 block w-full rounded-lg border border-(--border-app) bg-background p-2"><option value="filter">{live("filter")}</option><option value="vacation">{live("vacation")}</option><option value="advanced">{live("advanced")}</option></select></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.enabled} onChange={(event) => update(selected.key, { enabled: event.target.checked })} />{live("enabled")}</label>
                <label className="block text-sm">{live("source")}<textarea value={selected.source} maxLength={65536} rows={12} spellCheck={false} onChange={(event) => update(selected.key, { source: event.target.value })} className="mt-1 block w-full rounded-lg border border-(--border-app) bg-background p-3 font-mono text-xs" /></label>
                <div className="flex flex-wrap gap-2"><button type="button" disabled={checking || !selected.source.trim()} onClick={() => checkRule("validate")} className="rounded-lg border border-(--border-app) px-3 py-2 text-sm disabled:opacity-50">{live("validate")}</button></div>
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
              </div> : <p className="text-sm text-(--text-muted)">{live("empty")}</p>}
            </section>
          </div>
        </> : null}
      </div>
    </section>
  </WorkspaceLayout>;
}
