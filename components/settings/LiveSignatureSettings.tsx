"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useToast } from "@/context/toast-context";
import type { LiveMailIdentityPreference, LiveMailPreferences, LiveSignatureUpdate } from "@/lib/tastemail/preferences";
import { SettingsPageIntro, SettingsPanel, SettingRow } from "./SettingsPrimitives";

type Status = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
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

function responseStatus(payload: unknown): string {
  return payload && typeof payload === "object" && "status" in payload && typeof payload.status === "string"
    ? payload.status : "retryable";
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
  const mutationLock = useRef(false);
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
    fetch("/api/mail/preferences", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(responseStatus(payload));
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
    const identity = snapshot?.identities.find((item) => item.id === id);
    if (!identity || id === selectedId) return;
    if (dirty) { setPendingIdentityId(id); return; }
    setSelectedId(id);
    setDraft(formFrom(identity));
  }

  async function save() {
    if (!draft || !dirty || !valid || mutationLock.current) return;
    mutationLock.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/mail/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseStatus(payload));
      const result = snapshotFrom(payload);
      const saved = result.identities.find((identity) => identity.id === draft.identityId);
      if (!saved) throw new Error("unavailable");
      setSnapshot(result);
      setDraft(formFrom(saved));
      toast.success(live("saved"));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      toast.error(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
        ? service(reason as Status) : live("saveFailed"));
      setAttempt((value) => value + 1);
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }

  return <>
    <SettingsPageIntro title={t("nav.signature")} description={live("description")} />
    {status === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p>
      : status !== "ready" ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <p>{service(status)}</p><Button size="sm" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>{service("retry")}</Button>
      </div> : snapshot?.identities.length ? <>
        <SettingsPanel title={live("identityHeading")} description={live("serverNote")}>
          <SettingRow title={live("identityLabel")}>
            <Dropdown variant="form" label={live("identityLabel")} value={selectedId} onChange={selectIdentity} disabled={saving}
              options={snapshot.identities.map((identity) => ({ value: identity.id, label: identity.displayName ? `${identity.displayName} · ${identity.address}` : identity.address }))} />
          </SettingRow>
        </SettingsPanel>
        {selected && draft ? <SettingsPanel title={live("signatureHeading")}>
          <SettingRow title={live("formatLabel")}>
            <Dropdown variant="form" label={live("formatLabel")} value={draft.mailSignatureFormat} disabled={saving}
              onChange={(value) => setDraft((current) => current ? { ...current, mailSignatureFormat: value as "text/plain" | "text/html" } : null)}
              options={[{ value: "text/plain", label: live("plainFormat") }, { value: "text/html", label: live("htmlFormat") }]} />
          </SettingRow>
          {draft.mailSignatureFormat === "text/html" ? <Textarea label={live("htmlLabel")} hint={live("htmlHint")} rows={7} value={draft.mailSignatureHtml} disabled={saving}
            onChange={(event) => setDraft((current) => current ? { ...current, mailSignatureHtml: event.target.value } : null)} /> : null}
          <Textarea label={draft.mailSignatureFormat === "text/html" ? live("fallbackLabel") : live("textLabel")} rows={7} value={draft.mailSignature} disabled={saving}
            onChange={(event) => setDraft((current) => current ? { ...current, mailSignature: event.target.value } : null)} />
          {!valid ? <p role="alert" className="text-xs text-(--status-danger)">{live("invalid")}</p> : null}
        </SettingsPanel> : null}
        <div className="sticky bottom-0 -mx-4 mt-auto flex items-center justify-end gap-2 border-t border-(--border-app) bg-(--surface-app)/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7">
          <Button size="sm" disabled={!dirty || saving} onClick={() => { if (selected) setDraft(formFrom(selected)); }}>{t("common.cancel")}</Button>
          <Button size="sm" variant="primary" disabled={!dirty || !valid || saving} onClick={() => { void save(); }}>{t("common.save")}</Button>
        </div>
      </> : <p role="status" className="text-sm text-(--text-muted)">{live("noIdentities")}</p>}
    {pendingIdentityId ? <ConfirmDialog tone="warning" title={live("discardTitle")} description={live("discardDescription")}
      confirmLabel={t("unsaved.leave")} cancelLabel={t("unsaved.stay")} onCancel={() => setPendingIdentityId(null)}
      onConfirm={() => { const identity = snapshot?.identities.find((item) => item.id === pendingIdentityId); if (identity) { setSelectedId(identity.id); setDraft(formFrom(identity)); } setPendingIdentityId(null); }} /> : null}
  </>;
}
