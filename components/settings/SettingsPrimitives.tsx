"use client";

import { Children, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { Switch } from "@/components/ui/Switch";
import { useSettings } from "@/context/settings-context";
import { useToast } from "@/context/toast-context";

export function SettingsPageIntro({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-bold tracking-tight">{title}</h1><p className="mt-1 max-w-2xl text-sm text-(--text-muted)">{description}</p></div>{actions ? <div className="shrink-0">{actions}</div> : null}</header>;
}

export function SettingsPanel({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  const t = useTranslations("settingsSystem.empty");
  return <Panel title={title} description={description} actions={actions} className="overflow-visible">{Children.count(children) === 0 ? <EmptyState title={t("items")} className="min-h-28" /> : <div className="grid gap-4">{children}</div>}</Panel>;
}

export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="flex min-h-11 flex-col gap-3 border-b border-(--border-app) pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{title}</p>{description ? <p className="mt-0.5 text-xs text-(--text-muted)">{description}</p> : null}</div><div className="w-full shrink-0 sm:w-auto sm:max-w-sm">{children}</div></div>;
}

export function SwitchRow({ title, description, value, onChange }: { title: string; description?: string; value: boolean; onChange: (value: boolean) => void }) {
  return <SettingRow title={title} description={description}><Switch on={value} onToggle={() => onChange(!value)} label={title} /></SettingRow>;
}

export function SettingsSaveBar({ onReset, saveDisabled = false }: { onReset?: () => void; saveDisabled?: boolean } = {}) {
  const { isDirty, save, discard, reset } = useSettings();
  const toast = useToast();
  const t = useTranslations("settingsSystem.common");
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  return <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex items-center gap-2 border-t border-(--border-app) bg-(--surface-app)/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-7 sm:px-7"><Button ref={resetButtonRef} variant="ghost" size="sm" onClick={onReset ?? reset}>{t("reset")}</Button><span className="ml-auto hidden text-xs text-(--text-muted) sm:block">{isDirty ? t("unsaved") : t("saved")}</span><Button variant="secondary" size="sm" disabled={!isDirty} onClick={() => { discard(); resetButtonRef.current?.focus(); }}>{t("cancel")}</Button><Button variant="primary" size="sm" disabled={!isDirty || saveDisabled} onClick={() => { save(); resetButtonRef.current?.focus(); toast.success(t("savedToast")); }}>{t("save")}</Button></div>;
}
