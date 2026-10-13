"use client";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { ComposeEditor } from "@/components/compose/ComposeEditor";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useToast } from "@/context/toast-context";
import { clientMailFailure, clientMutationFailure } from "@/lib/tastemail/client-session-status";
import type { LiveMailIdentityPreference, LiveMailPreferences, LiveSignatureUpdate } from "@/lib/tastemail/preferences";
import { SettingsPageIntro, SettingsPanel, SettingRow } from "./SettingsPrimitives";

type Status = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
const LOAD_TIMEOUT_MS = 25_000;
const SAVE_TIMEOUT_MS = 30_000;
const SAVE_ERRORS = new Set(["invalid_request", "unauthorized", "forbidden", "rateLimited", "conflict", "retryable", "unavailable"]);
const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;

function formFrom(identity: LiveMailIdentityPreference): LiveSignatureUpdate {
  return {
    identityId: identity.id,
    mailSignature: identity.mailSignature,
    mailSignatureHtml: identity.mailSignatureHtml,
    mailSignatureFormat: identity.mailSignatureFormat,
  };
}

function snapshotFrom(value: unknown): LiveMailPreferences {
  if (!value || typeof value !== "object" || !("identities" in value) || !Array.isArray(value.identities) ||
    value.identities.some((item: unknown) => !item || typeof item !== "object" || !("id" in item) ||
      typeof item.id !== "string" || !("address" in item) || typeof item.address !== "string" ||
      !("mailSignature" in item) || typeof item.mailSignature !== "string" ||
      !("mailSignatureHtml" in item) || typeof item.mailSignatureHtml !== "string" ||
      !("mailSignatureFormat" in item) || (item.mailSignatureFormat !== "text/plain" && item.mailSignatureFormat !== "text/html"))) {
    throw new Error("unavailable");
  }
  return value as LiveMailPreferences;
}

export function LiveSignatureSettings() {
  const t = useTranslations("settingsSystem");
  const live = useTranslations("signatureLive");
  const service = useTranslations("liveService");
  const toast = useToast();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [snapshot, setSnapshot] = useState<LiveMailPreferences | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<LiveSignatureUpdate | null>(null);
  const [pendingIdentityId, setPendingIdentityId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveUncertain, setSaveUncertain] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const mutationLock = useRef(false);
  const uncertainSave = useRef(false);
  const selectedIdRef = useRef(selectedId);
  const selected = snapshot?.identities.find((identity) => identity.id === selectedId) ?? null;
  const dirty = Boolean(selected && draft && (draft.mailSignature !== selected.mailSignature ||
    draft.mailSignatureFormat !== selected.mailSignatureFormat ||
    draft.mailSignatureHtml !== selected.mailSignatureHtml));
  const valid = Boolean(draft && new TextEncoder().encode(draft.mailSignature).length <= 8192 &&
    !UNSAFE.test(draft.mailSignature) && new TextEncoder().encode(draft.mailSignatureHtml).length <= 32768 &&
    !UNSAFE.test(draft.mailSignatureHtml) && (draft.mailSignatureFormat !== "text/html" ||
      Boolean(draft.mailSignature.trim() && draft.mailSignatureHtml.trim())));

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(LOAD_TIMEOUT_MS)]);
    fetch("/api/mail/preferences", { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(clientMailFailure(response.status, payload));
        return snapshotFrom(payload);
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setSnapshot(result);
        setStatus("ready");
        const first = result.identities.find((identity) => identity.isDefault) ?? result.identities[0];
        if (first) {
          const selectedIdentity = result.identities.find((identity) => identity.id === selectedIdRef.current);
          if (!selectedIdentity) {
            setSelectedId(first.id);
            setDraft(formFrom(first));
          } else {
            setDraft((current) => current ?? formFrom(selectedIdentity));
          }
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setStatus(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason) ? reason as Status : "retryable");
      });
    return () => controller.abort();
  }, [attempt]);

  function selectIdentity(id: string) {
    if (saveUncertain) return;
    const identity = snapshot?.identities.find((item) => item.id === id);
    if (!identity || id === selectedId) return;
    if (dirty) { setPendingIdentityId(id); return; }
    setSelectedId(id);
    setDraft(formFrom(identity));
  }

  async function save() {
    if (!draft || !dirty || !valid || status !== "ready" || saveUncertain || uncertainSave.current || mutationLock.current) return;
    mutationLock.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/mail/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
        signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(clientMutationFailure(response.status, payload));
      const result = snapshotFrom(payload);
      const saved = result.identities.find((identity) => identity.id === draft.identityId);
      if (!saved) throw new Error("unavailable");
      setSnapshot(result);
      setDraft(formFrom(saved));
      setEditorRevision((value) => value + 1);
      toast.success(live("saved"));
    } catch (error) {
      const reason = error instanceof Error && SAVE_ERRORS.has(error.message) ? error.message : "retryable";
      if (reason === "retryable" || reason === "unavailable") {
        uncertainSave.current = true;
        setSaveUncertain(true);
        toast.error(live("saveUncertain"));
      } else {
        toast.error(["unauthorized", "forbidden", "rateLimited"].includes(reason)
          ? service(reason as Status) : live("saveFailed"));
      }
      setStatus("loading");
      setAttempt((value) => value + 1);
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }

  function reviewSave() {
    if (mutationLock.current || status !== "ready") return;
    uncertainSave.current = false;
    setSaveUncertain(false);
  }

  return <>
    <SettingsPageIntro title={t("nav.signature")} description={live("description")} />
    {saveUncertain ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-(--radius-app) border border-(--border-app) bg-(--status-warning-bg) px-4 py-3 text-sm">
      <p className="flex-1">{live("saveUncertain")}</p>
      <Button size="sm" disabled={status !== "ready" || saving} onClick={reviewSave}>{live("reviewed")}</Button>
    </div> : null}
    {saveUncertain && status === "ready" && selected ? <div className="rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) p-4 text-sm">
      <p className="font-semibold">{live("serverValue")}</p>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word text-xs text-(--text-muted)">{selected.mailSignatureFormat === "text/html" ? selected.mailSignatureHtml : selected.mailSignature}</pre>
    </div> : null}
    {status === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p>
      : status !== "ready" ? <SystemErrorNotice message={service(status)} actionLabel={service("retry")} onAction={() => { setStatus("loading"); setAttempt((value) => value + 1); }} /> : snapshot?.identities.length ? <>
        <SettingsPanel title={live("identityHeading")} description={live("serverNote")}>
          <SettingRow title={live("identityLabel")}>
            <Dropdown variant="form" align="right" label={live("identityLabel")} value={selectedId} onChange={selectIdentity} disabled={saving || saveUncertain}
              options={snapshot.identities.map((identity) => ({ value: identity.id, label: identity.displayName ? `${identity.displayName} · ${identity.address}` : identity.address }))} />
          </SettingRow>
        </SettingsPanel>
        {selected && draft ? <SettingsPanel title={live("signatureHeading")}>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("fields.signatureContent")}</p>
            <div className="flex min-h-64 min-w-0 flex-col rounded-(--radius-app) border border-(--border-app) bg-(--surface-app)">
              <ComposeEditor key={`${selectedId}-${editorRevision}`} initialMode="rich" emitInitialHtml={false}
                label={t("fields.signatureContent")} value={draft.mailSignature}
                initialHtml={draft.mailSignatureFormat === "text/html" ? draft.mailSignatureHtml : null}
                allowInlineImages={false} disabled={saving || saveUncertain}
                onChange={(mailSignature) => setDraft((current) => current ? { ...current, mailSignature } : null)}
                onHtmlChange={(html) => setDraft((current) => current ? { ...current, mailSignatureHtml: current.mailSignature.trim() ? html ?? "" : "", mailSignatureFormat: html === null || !current.mailSignature.trim() ? "text/plain" : "text/html" } : null)} />
            </div>
          </div>
          {!valid ? <p role="alert" className="text-xs text-(--status-danger)">{live("invalid")}</p> : null}
        </SettingsPanel> : null}
        <div className="sticky bottom-0 -mx-4 mt-auto flex items-center justify-end gap-2 border-t border-(--border-app) bg-(--surface-app)/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7">
          <Button size="sm" disabled={!dirty || saving || saveUncertain} onClick={() => { if (selected) { setDraft(formFrom(selected)); setEditorRevision((value) => value + 1); } }}>{t("common.cancel")}</Button>
          <Button size="sm" variant="primary" disabled={!dirty || !valid || saving || saveUncertain} onClick={() => { void save(); }}>{t("common.save")}</Button>
        </div>
      </> : <p role="status" className="text-sm text-(--text-muted)">{live("noIdentities")}</p>}
    {pendingIdentityId ? <ConfirmDialog tone="warning" title={live("discardTitle")} description={live("discardDescription")}
      confirmLabel={t("unsaved.leave")} cancelLabel={t("unsaved.stay")} onCancel={() => setPendingIdentityId(null)}
      onConfirm={() => { const identity = snapshot?.identities.find((item) => item.id === pendingIdentityId); if (identity) { setSelectedId(identity.id); setDraft(formFrom(identity)); } setPendingIdentityId(null); }} /> : null}
  </>;
}
