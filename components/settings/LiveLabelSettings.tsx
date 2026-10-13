"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Tag } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { labelFields, requireLabelReceipt, requireUserLabels, type LabelCommand, type UserLabel, type UserLabels } from "@/lib/user-labels";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";

const PALETTE = ["#3366FF", "#16A34A", "#DC2626", "#D97706", "#9333EA", "#0891B2", "#DB2777", "#64748B"];
type Status = "loading" | "ready" | "not_deployed" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
export function LiveLabelSettings() {
  const { accountAddress } = useMail();
  return <LabelSettingsContent key={accountAddress ?? "session"} />;
}
export function LabelSettingsContent() {
  const t = useTranslations("settingsSystem"), live = useTranslations("labelsLive"), service = useTranslations("liveService");
  const toast = useToast();
  const [data, setData] = useState<UserLabels | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UserLabel | null>(null);
  const locked = useRef(false), mounted = useRef(false);
  const selected = data?.labels.find(label => label.id === editing);
  const dirty = formOpen && (name !== (selected?.name ?? "") || color !== (selected?.color ?? PALETTE[0]));
  const disabled = status !== "ready" || busy || uncertain;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/labels", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) }).then(async response => {
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 404 ? "not_deployed" : clientMailFailure(response.status, payload));
      const labels = requireUserLabels(payload);
      if (controller.signal.aborted) return;
      setData(labels); setStatus("ready"); setUncertain(false); locked.current = false;
    }).catch(reason => {
      if (controller.signal.aborted) return;
      const value = reason instanceof Error ? reason.message : "retryable";
      setStatus(["not_deployed", "unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(value) ? value as Status : "retryable");
    });
    return () => controller.abort();
  }, [attempt]);
  const clearForm = () => { setEditing(null); setFormOpen(false); setName(""); setColor(PALETTE[0]); setError(""); };
  const mayDiscard = () => !dirty || window.confirm(live("discard"));
  const reload = () => {
    if (busy || !mayDiscard()) return;
    clearForm(); setPendingDelete(null); setStatus("loading"); setAttempt(value => value + 1);
  };
  const openForm = (label?: UserLabel) => {
    if (disabled || !mayDiscard()) return;
    setEditing(label?.id ?? null); setName(label?.name ?? ""); setColor(label?.color ?? PALETTE[0]); setFormOpen(true); setError("");
  };
  const mutate = async (command: LabelCommand) => {
    if (!data || disabled || locked.current) return;
    locked.current = true; setBusy(true); setPendingDelete(null);
    try {
      const response = await fetch(`/api/mail/labels${command.method === "POST" ? "" : `/${command.id}`}`, {
        method: command.method, headers: { "content-type": "application/json" }, body: JSON.stringify(command.input), signal: AbortSignal.timeout(25_000),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" && ["duplicate", "limit", "conflict", "not_found", "invalid_request", "mutation_uncertain"].includes(reason) ? reason : response.status >= 500 ? "mutation_uncertain" : clientMailFailure(response.status, payload));
      }
      const labels = requireLabelReceipt(payload, command, data);
      if (!mounted.current) return;
      setData(labels); clearForm(); locked.current = false;
      toast.success(command.method === "DELETE" ? t("toast.labelDeleted") : t("common.savedToast"));
    } catch (reason) {
      if (!mounted.current) return;
      const value = reason instanceof Error ? reason.message : "mutation_uncertain";
      if (["mutation_uncertain", "unavailable", "conflict", "not_found"].includes(value) || !["duplicate", "limit", "invalid_request", "unauthorized", "forbidden", "rateLimited"].includes(value)) {
        setUncertain(true); toast.warning(live("uncertain"));
      } else {
        locked.current = false;
        if (["duplicate", "limit", "invalid_request"].includes(value)) setError(value === "duplicate" ? t("errors.duplicateLabel") : live(value === "limit" ? "limit" : "invalid"));
        else toast.error(service(value as "unauthorized" | "forbidden" | "rateLimited"));
      }
    } finally { if (mounted.current) setBusy(false); }
  };
  const save = () => {
    if (!data || disabled) return;
    const fields = labelFields(name, color);
    if (!fields) { setError(live("invalid")); return; }
    if (data.labels.some(label => label.id !== editing && label.name.toLowerCase() === fields.name.toLowerCase())) { setError(t("errors.duplicateLabel")); return; }
    const input = { revision: data.revision, ...fields };
    void mutate(editing ? { method: "PATCH", id: editing, input } : { method: "POST", input });
  };
  return <section aria-label={t("nav.labels")} className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm leading-relaxed text-(--text-muted)">{live("description")}</p><Button size="sm" disabled={busy} loading={status === "loading"} onClick={reload}>{live("reload")}</Button></div>
    {status === "not_deployed" ? <p role="status" className="rounded-(--radius-app) border border-(--status-warning)/30 bg-(--surface-muted) p-4 text-sm">{live("notDeployed")}</p> : status !== "ready" && status !== "loading" ? <SystemErrorNotice message={service(status)} actionLabel={service("retry")} onAction={reload} /> : null}
    {uncertain ? <p role="alert" className="text-sm text-(--status-warning)">{live("uncertain")}</p> : null}
    {status === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p> : null}
    {status === "ready" && data ? <>
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-(--text-muted)">{data.labels.length} / 256</span><Button leadingIcon={<Plus size={16} aria-hidden="true" />} disabled={disabled || data.labels.length >= 256} onClick={() => openForm()}>{t("actions.addLabel")}</Button></div>
      {formOpen ? <form onSubmit={event => { event.preventDefault(); save(); }} className="space-y-4 rounded-(--radius-app) border border-(--border-app) bg-background p-4">
        <h3 className="text-sm font-semibold">{t(editing ? "actions.editLabel" : "actions.addLabel")}</h3>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]"><Input label={t("fields.labelName")} autoFocus autoComplete="off" value={name} maxLength={128} disabled={disabled} onChange={event => { setName(event.target.value); setError(""); }} /><Input label={t("fields.labelColor")} value={color} maxLength={7} disabled={disabled} onChange={event => { setColor(event.target.value); setError(""); }} leadingIcon={<span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(color) ? color : "transparent" }} />} /></div>
        <div role="group" aria-label={t("fields.labelColor")} className="flex flex-wrap gap-2">{PALETTE.map(value => <button key={value} type="button" aria-label={`${t("fields.labelColor")} ${value}`} aria-pressed={color.toUpperCase() === value} disabled={disabled} onClick={() => { setColor(value); setError(""); }} className="flex size-9 items-center justify-center rounded-md border border-(--border-app) outline-none aria-pressed:border-(--color-primary-ink) focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:opacity-45"><span aria-hidden="true" className="size-5 rounded-full" style={{ backgroundColor: value }} /></button>)}</div>
        {error ? <p role="alert" className="text-sm text-(--status-danger)">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button disabled={disabled} onClick={() => { if (mayDiscard()) clearForm(); }}>{t("common.cancel")}</Button><Button type="submit" variant="primary" disabled={disabled || !name.trim() || editing !== null && !dirty} loading={busy}>{t("common.save")}</Button></div>
      </form> : null}
      {!data.labels.length ? <p className="rounded-(--radius-app) border border-dashed border-(--border-app) p-5 text-sm text-(--text-muted)">{live("empty")}</p> : <ul className="divide-y divide-(--border-app) rounded-(--radius-app) border border-(--border-app) bg-background px-4">{data.labels.map(label => <li key={label.id} className="flex flex-wrap items-center gap-3 py-3"><Tag size={18} aria-hidden="true" style={{ color: label.color }} /><span className="min-w-0 flex-1 break-words text-sm font-medium">{label.name}</span><div className="flex gap-2"><Button size="sm" disabled={disabled} onClick={() => openForm(label)}>{t("common.edit")}</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={() => { if (mayDiscard()) setPendingDelete(label); }} className="text-(--status-danger)">{t("common.delete")}</Button></div></li>)}</ul>}
    </> : null}
    {pendingDelete && data ? <ConfirmDialog tone="destructive" title={t("confirm.deleteLabel")} description={`${pendingDelete.name} — ${live("deleteHelp")}`} confirmLabel={t("common.delete")} onCancel={() => setPendingDelete(null)} onConfirm={() => void mutate({ method: "DELETE", id: pendingDelete.id, input: { revision: data.revision } })} /> : null}
  </section>;
}
