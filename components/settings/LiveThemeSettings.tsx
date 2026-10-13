"use client";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useTheme } from "@/context/theme-context";
import { useToast } from "@/context/toast-context";
import { canSelectTheme, themeCatalogChoices, themeChoiceKey } from "@/lib/theme-catalog";
import { projectUserThemeSnapshot, requireInheritedThemeSnapshot, requireUserThemeReceipt, type UserThemeSnapshot, type UserThemeUpdate } from "@/lib/user-theme";
import { clientMailFailure, clientMutationFailure } from "@/lib/tastemail/client-session-status";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { SettingsPageIntro, SettingsPanel, SettingRow } from "./SettingsPrimitives";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { ThemeSelectionCard } from "@/components/customizer/ThemePresetGallery";
import { THEME_PRESETS } from "@/lib/theme-presets";

export function LiveThemeSettings() {
  const t = useTranslations("settingsSystem"), service = useTranslations("liveService"), admin = useTranslations("adminManage"), fields = useTranslations("adminFields"), rules = useTranslations("rulesLive");
  const router = useRouter(), toast = useToast();
  const live = useTranslations("themeLive");
  const customizer = useTranslations("themeCustomizer");
  const { adoptServerTheme } = useTheme();
  const [snapshot, setSnapshot] = useState<UserThemeSnapshot | null>(null);
  const [draft, setDraft] = useState<UserThemeUpdate | null>(null);
  const [attempt, setAttempt] = useState(0), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null), [blocked, setBlocked] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const lock = useRef(false), alive = useRef(true), blockedRef = useRef(false), revision = useRef<number | null>(null), currentSnapshot = useRef<UserThemeSnapshot | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/theme", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) })
      .then(async response => { const payload: unknown = await response.json(); if (!response.ok) throw new Error(clientMailFailure(response.status, payload)); const value = projectUserThemeSnapshot(payload); if (!value.catalog) throw new Error("unavailable"); return value; })
      .then(value => {
        if (controller.signal.aborted) return;
        setSnapshot(value); setDraft({ expectedRevision: value.settings?.revision ?? 0, themeId: value.resolved.theme.id, themeVersion: value.resolved.theme.version, density: value.resolved.density, colorMode: value.resolved.colorMode, action: "activate" });
        revision.current = value.settings?.revision ?? 0; blockedRef.current = false;
        currentSnapshot.current = value;
        setBlocked(false); setError(null);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error && ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason.message) ? reason.message : "unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const dirty = Boolean(draft && snapshot && (draft.themeId !== snapshot.resolved.theme.id || draft.themeVersion !== snapshot.resolved.theme.version || draft.density !== snapshot.resolved.density || draft.colorMode !== snapshot.resolved.colorMode));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const choices = snapshot?.catalog ? themeCatalogChoices(snapshot.catalog) : [];
  const selected = draft ? choices.find(choice => themeChoiceKey(choice) === themeChoiceKey(draft)) : undefined;
  const selectable = Boolean(draft && snapshot?.catalog && canSelectTheme(snapshot.catalog, draft));
  const editable = !loading && !saving && !blocked && snapshot?.resolved.userSelectionAllowed === true;
  async function save() {
    if (lock.current || blockedRef.current || !editable || !draft || currentSnapshot.current !== snapshot || draft.expectedRevision !== revision.current || !selectable || !dirty) return;
    lock.current = true; setSaving(true); setError(null);
    const submitted = { ...draft };
    try {
      const response = await fetch("/api/mail/theme", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(submitted), signal: AbortSignal.timeout(28_000) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(clientMutationFailure(response.status, payload));
      const settings = requireUserThemeReceipt(payload, submitted);
      if (!alive.current) return;
      // Only a matching receipt advances the revision or discards local overrides.
      const resolved = { ...snapshot!.resolved, theme: settings.theme, density: submitted.density, colorMode: submitted.colorMode, source: "user" as const };
      const next = { settings, resolved, catalog: snapshot?.catalog };
      currentSnapshot.current = next; setSnapshot(next); setDraft({ ...submitted, expectedRevision: settings.revision });
      revision.current = settings.revision;
      adoptServerTheme(resolved); router.refresh(); toast.success(t("common.savedToast"));
    } catch (reason) {
      if (!alive.current) return;
      setBlocked(true);
      blockedRef.current = true;
      setError(reason instanceof Error && ["unauthorized", "forbidden", "rateLimited"].includes(reason.message) ? reason.message : "uncertain");
    } finally { lock.current = false; if (alive.current) setSaving(false); }
  }
  async function clear() {
    // Removal remains possible under an admin selection lock, as in Rust.
    if (lock.current || blockedRef.current || loading || saving || blocked || currentSnapshot.current !== snapshot || !snapshot?.settings || snapshot.settings.revision !== revision.current) return;
    lock.current = true; setSaving(true); setError(null); setConfirmReset(false);
    const expectedRevision = snapshot.settings.revision;
    try {
      const response = await fetch("/api/mail/theme", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision }), signal: AbortSignal.timeout(28_000) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(clientMutationFailure(response.status, payload));
      const value = { ...requireInheritedThemeSnapshot(payload), catalog: snapshot?.catalog };
      if (!alive.current) return;
      revision.current = 0; currentSnapshot.current = value; setSnapshot(value);
      setDraft({ expectedRevision: 0, themeId: value.resolved.theme.id, themeVersion: value.resolved.theme.version, density: value.resolved.density, colorMode: value.resolved.colorMode, action: "activate" });
      adoptServerTheme(value.resolved); router.refresh(); toast.success(t("common.savedToast"));
    } catch (reason) {
      if (!alive.current) return;
      blockedRef.current = true; setBlocked(true);
      setError(reason instanceof Error && ["unauthorized", "forbidden", "rateLimited"].includes(reason.message) ? reason.message : "uncertain");
    } finally { lock.current = false; if (alive.current) setSaving(false); }
  }
  return <>
    <SettingsPageIntro title={t("nav.theme")} description={t("descriptions.theme")} />
    {loading ? <p role="status">{service("loading")}</p> : null}
    {error ? <SystemErrorNotice message={error === "uncertain" ? admin("uncertain") : service(error)} /> : null}
    <Button variant="secondary" disabled={saving || loading} onClick={() => { if (lock.current) return; blockedRef.current = true; setLoading(true); setAttempt(value => value + 1); }}>{admin("refresh")}</Button>
    {snapshot && draft ? <SettingsPanel title={t("sections.appearance")}>
      {!snapshot.resolved.userSelectionAllowed ? <p>{fields("userSelectionAllowed")}: {rules("no")}</p> : null}
      <div role="group" aria-label={t("sections.themePreset")} className="grid grid-cols-1 gap-3">
        {choices.map((choice) => {
          const preset = choice.themeVersion === null ? THEME_PRESETS.find(item => `tastemail-${item.id}` === choice.themeId) : undefined;
          return <ThemeSelectionCard key={themeChoiceKey(choice)} label={choice.name}
            description={preset ? customizer(`presets.${preset.id}`) : choice.themeVersion ?? undefined}
            preview={preset?.settings} selected={themeChoiceKey(choice) === themeChoiceKey(draft)} disabled={!editable}
            onSelect={() => setDraft({ ...draft, themeId: choice.themeId, themeVersion: choice.themeVersion, density: choice.densities.includes(draft.density) ? draft.density : choice.densities[0], colorMode: choice.colorModes.includes(draft.colorMode) ? draft.colorMode : choice.colorModes[0] })} />;
        })}
        {!selected ? <ThemeSelectionCard label={draft.themeId} description={draft.themeVersion ?? undefined} selected disabled onSelect={() => {}} /> : null}
      </div>
      <SettingRow title={t("fields.density")}><Dropdown label={t("fields.density")} variant="form" align="right" value={draft.density} disabled={!editable || !selected} options={(selected?.densities ?? [draft.density]).map(value => ({ value, label: t(`options.density.${value === "dense" ? "compact" : value}`) }))} onChange={density => setDraft({ ...draft, density: density as UserThemeUpdate["density"] })} /></SettingRow>
      <SettingRow title={t("fields.colorScheme")}><Dropdown label={t("fields.colorScheme")} variant="form" align="right" value={draft.colorMode} disabled={!editable || !selected} options={(selected?.colorModes ?? [draft.colorMode]).map(value => ({ value, label: t(`options.colorScheme.${value}`) }))} onChange={colorMode => setDraft({ ...draft, colorMode: colorMode as UserThemeUpdate["colorMode"] })} /></SettingRow>
      <Button variant="primary" disabled={!editable || !dirty || !selectable} onClick={save}>{t("common.save")}</Button>
      <Button variant="secondary" disabled={loading || saving || blocked || !snapshot.settings} onClick={() => setConfirmReset(true)}>{live("inherit")}</Button>
    </SettingsPanel> : null}
    {confirmReset ? <ConfirmDialog tone="warning" title={live("inherit")} description={live("inheritDescription")} confirmLabel={live("inherit")} cancelLabel={t("common.cancel")} confirmDisabled={saving || loading || blocked} onCancel={() => setConfirmReset(false)} onConfirm={clear} /> : null}
  </>;
}
