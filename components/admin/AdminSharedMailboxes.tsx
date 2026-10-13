"use client";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { AdminPageActions, useAdminShell } from "./AdminShell";
import { AdminQuotaInput } from "./AdminQuotaInput";
import { AdminStorageUsage } from "./AdminStorageUsage";
import { useAdminDraftGuard, useAdminDraftProtection } from "./AdminDraftGuard";
import { retainSharedDraft, removeSharedDraft, type AdminSharedDrafts } from "@/lib/admin-shared-drafts";
import { adminInitialReadGate } from "@/lib/admin-initial-read";
import { adminSharedDetail, adminSharedList, adminSharedPlan, duplicateSharedGrantIndex, normalizedSharedRights, sharedRightKeys, type AdminSharedDetail, type AdminSharedGrant, type AdminSharedMailbox } from "@/lib/tastemail/admin-shared-contract";

export function AdminSharedMailboxes({ initialItems, initialError }: { initialItems?: AdminSharedMailbox[]; initialError?: string } = {}) {
  const t = useTranslations("adminManage"), shared = useTranslations("mailboxesLive"), notice = useTranslations("adminShared"), service = useTranslations("liveService"), labels = useTranslations();
  const { setMutationBusy } = useAdminShell();
  const [items, setItems] = useState<AdminSharedMailbox[]>(initialItems ?? []), [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminSharedDetail | null>(null), [grants, setGrants] = useState<AdminSharedGrant[]>([]);
  const [drafts, setDrafts] = useState<AdminSharedDrafts>({});
  const draftCache = useRef<AdminSharedDrafts>({});
  useEffect(() => { draftCache.current = drafts; }, [drafts]);
  const [revision, setRevision] = useState(0), [loading, setLoading] = useState(false), [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState<string | null>(initialError ?? null);
  const initialRead = useRef(adminInitialReadGate(initialItems !== undefined || initialError !== undefined, "0"));
  const [creating, setCreating] = useState(false), [confirmed, setConfirmed] = useState(false), [completed, setCompleted] = useState(false);
  const [input, setInput] = useState({ address: "", displayName: "", quotaBytes: "10737418240" });
  const [duplicateIndex, setDuplicateIndex] = useState(-1);
  const grantsForm = useRef<HTMLFormElement>(null);
  const { requestAction } = useAdminDraftGuard();
  const createDirty = creating && (input.address !== "" || input.displayName !== "" || input.quotaBytes !== "10737418240");
  const grantsDirty = !!detail && JSON.stringify(grants) !== JSON.stringify(detail.grants);
  useAdminDraftProtection(createDirty || grantsDirty || Object.keys(drafts).length > 0, saving);
  const alive = useRef(true), inFlight = useRef(false), writeBlocked = useRef(false);
  const retiredSnapshot = useRef<object | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (initialRead.current(String(revision))) return;
    const controller = new AbortController(); let active = true;
    async function load() {
      setLoading(true); setError(current => current === "conflict" ? current : null);
      try {
        const response = await fetch("/api/mail/admin/shared-mailboxes", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.status);
        const parsed = adminSharedList(payload); if (active) setItems(parsed.items);
      } catch (error) { if (active) { setItems([]); setError(error instanceof Error ? error.message : "retryable"); } }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; controller.abort(); };
  }, [revision]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController(); let active = true;
    async function load() {
      setDetailLoading(true); setDetail(null); setConfirmed(false);
      try {
        const retained = draftCache.current[selected!];
        if (retained) {
          setDetail(retained.detail); setGrants(retained.grants); setDuplicateIndex(-1);
          setDrafts(current => removeSharedDraft(current, selected!));
          return;
        }
        const response = await fetch(`/api/mail/admin/shared-mailboxes?id=${encodeURIComponent(selected!)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.status);
        const parsed = adminSharedDetail(payload, selected!); if (active) { setDetail(parsed); setGrants(parsed.grants); setDuplicateIndex(-1); }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "retryable"); }
      finally { if (active) setDetailLoading(false); }
    }
    void load(); return () => { active = false; controller.abort(); };
  }, [selected, revision]);
  const blocked = saving || uncertain || loading || detailLoading;
  const denied = error === "unauthorized" || error === "forbidden";
  const rightLabels = { mayRead: shared("read"), mayWrite: shared("write"), maySend: shared("send"), mayManage: shared("manage") };
  const control = "min-h-11 w-full min-w-0 rounded-md border border-(--border-app) bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-(--focus-ring)";
  function selectMailbox(id: string) {
    if (blocked || denied || creating) return;
    if (id !== selected) setDrafts(current => retainSharedDraft(current, detail, grants));
    setSelected(id); setConfirmed(false); setCompleted(false); setDuplicateIndex(-1);
  }
  function createMailbox() {
    if (blocked || denied) return;
    setDrafts(current => retainSharedDraft(current, detail, grants));
    setCreating(true); setConfirmed(false); setCompleted(false);
  }
  function changeGrant(index: number, next: Partial<AdminSharedGrant>) { setConfirmed(false); setCompleted(false); setDuplicateIndex(-1); setGrants(current => current.map((grant, i) => i === index ? { ...grant, ...next } : grant)); }
  function cancelCreate() {
    if (saving) return;
    requestAction(() => {
      setCreating(false); setConfirmed(false); setCompleted(false);
      setInput({ address: "", displayName: "", quotaBytes: "10737418240" });
    }, createDirty);
  }
  function cancelGrants() {
    if (blocked || denied || !detail) return;
    requestAction(() => {
      setDrafts(current => removeSharedDraft(current, detail.mailbox.id));
      setGrants(detail.grants.map(grant => ({ ...grant, rights: { ...grant.rights } })));
      setConfirmed(false); setCompleted(false); setDuplicateIndex(-1);
    }, grantsDirty);
  }
  async function save(event: React.FormEvent, action: "create" | "grants") {
    event.preventDefault(); const snapshot = action === "create" ? input : detail;
    if (!snapshot || snapshot === retiredSnapshot.current || inFlight.current || writeBlocked.current || blocked || denied || !confirmed) return;
    if (action === "grants") {
      const duplicate = duplicateSharedGrantIndex(grants); setDuplicateIndex(duplicate);
      if (duplicate >= 0) { grantsForm.current?.querySelectorAll<HTMLInputElement>("[data-shared-grant-address]")[duplicate]?.focus(); return; }
    }
    const request = action === "create" ? { action, input, confirmed: true } : { action, id: detail?.mailbox.id, expectedRevision: detail?.mailbox.revision, grants, confirmed: true };
    try { adminSharedPlan(request); } catch { setError("invalid_request"); return; }
    inFlight.current = true; setSaving(true); setMutationBusy(true); setError(null); setCompleted(false);
    try {
      const response = await fetch("/api/mail/admin/shared-mailboxes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(15000) });
      const payload = await response.json();
      if (!response.ok || payload.status !== "updated") { if (response.ok || response.status >= 500 || payload.status === "mutationUncertain") writeBlocked.current = true; if (response.status === 409) retiredSnapshot.current = snapshot; if (alive.current) { setError(payload.status ?? "mutationUncertain"); if (writeBlocked.current) setUncertain(true); if (response.status === 409) { if (detail) setDrafts(current => removeSharedDraft(current, detail.mailbox.id)); setDetail(null); setConfirmed(false); setRevision(value => value + 1); } } return; }
      retiredSnapshot.current = snapshot;
      if (alive.current) { if (action === "grants" && detail) setDrafts(current => removeSharedDraft(current, detail.mailbox.id)); setConfirmed(false); setCompleted(true); setCreating(false); if (action === "create") { setSelected(payload.id); setInput({ address: "", displayName: "", quotaBytes: "10737418240" }); } setRevision(value => value + 1); }
    } catch { writeBlocked.current = true; if (alive.current) { setUncertain(true); setError("mutationUncertain"); } }
    finally { inFlight.current = false; if (alive.current) { setSaving(false); setMutationBusy(false); } }
  }
  const errorText = uncertain ? t("uncertain") : error === "licenseLimit" ? notice("licenseLimit") : error === "invalid_request" ? t("invalidInput") : ["unauthorized", "forbidden", "rateLimited", "conflict", "unavailable", "notFound"].includes(error ?? "") ? service(error === "notFound" ? "unavailable" : error!) : service("retryable");
  return <section className="space-y-4" aria-busy={loading || detailLoading || saving}>
    <AdminPageActions><Button disabled={saving || loading || detailLoading} onClick={() => requestAction(() => { setDrafts({}); setCreating(false); setInput({ address: "", displayName: "", quotaBytes: "10737418240" }); setConfirmed(false); setGrants(detail?.grants ?? []); setRevision(value => value + 1); })}>{t("refresh")}</Button><Button variant="primary" disabled={blocked || denied} onClick={createMailbox}>{t("create")}</Button></AdminPageActions>
    {(loading || detailLoading) && <p role="status">{service("loading")}</p>}
    {(error || uncertain) && <SystemErrorNotice message={errorText} className="rounded-md border border-(--border-app) bg-background p-3 text-sm" />}
    {completed && <p role="status" className="text-sm">{t("completed")}</p>}
    {creating && !denied && <form onSubmit={event => void save(event, "create")} className="space-y-4 rounded-md border border-(--border-app) bg-background p-4"><h2 className="font-semibold">{t("create")} · {labels("workspaceSidebar.mailboxes")}</h2><p className="text-sm text-(--text-muted)">{notice("createNotice")}</p><fieldset disabled={saving || uncertain} className="grid gap-3 sm:grid-cols-3"><label className="space-y-2 text-xs"><span>{labels("auth.common.email")}</span><input required type="email" maxLength={320} value={input.address} onChange={event => { setConfirmed(false); setInput({ ...input, address: event.target.value }); }} className={control} /></label><label className="space-y-2 text-xs"><span>{labels("auth.signup.name")}</span><input required maxLength={200} value={input.displayName} onChange={event => { setConfirmed(false); setInput({ ...input, displayName: event.target.value }); }} className={control} /></label><div className="space-y-2 text-xs"><label htmlFor="shared-create-quota">{shared("storage")}</label><AdminQuotaInput id="shared-create-quota" value={input.quotaBytes} required disabled={saving || uncertain} onChange={quotaBytes => { setConfirmed(false); setCompleted(false); setInput({ ...input, quotaBytes }); }} /></div></fieldset><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving || uncertain} onChange={event => setConfirmed(event.target.checked)} className="size-5" />{t("confirmed")}</label><div className="flex gap-2"><Button type="submit" loading={saving} variant="primary" disabled={blocked || !confirmed}>{t("save")}</Button><Button disabled={saving} onClick={cancelCreate}>{t("cancel")}</Button></div></form>}
    {!denied && <div className="overflow-x-auto rounded-sm border border-(--border-app) bg-background"><table className="w-full min-w-160 text-left text-xs"><thead><tr>{[labels("auth.common.email"), labels("auth.signup.name"), shared("storage"), t("actions")].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-t border-(--border-app)"><td className="p-3">{item.address}</td><td className="p-3">{item.displayName}{(drafts[item.id] || item.id === selected && grantsDirty) && <span className="block text-(--text-muted)">{labels("settingsSystem.unsaved.title")}</span>}</td><td className="p-3"><AdminStorageUsage name={item.displayName} usedBytes={item.usedBytes} quotaBytes={item.quotaBytes} /></td><td className="p-3"><Button size="sm" disabled={saving || detailLoading || creating} onClick={() => selectMailbox(item.id)}>{shared("manage")}</Button></td></tr>)}</tbody></table>{!loading && !items.length && <p className="p-4 text-sm">{shared("empty")}</p>}</div>}
    {detail && !creating && !denied && <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-(--border-app) bg-background p-4 text-sm"><span>{detail.mailbox.displayName} · {shared("storage")}</span><AdminStorageUsage name={detail.mailbox.displayName} usedBytes={detail.mailbox.usedBytes} quotaBytes={detail.mailbox.quotaBytes} /></div>}
    {detail && !creating && !denied && <form ref={grantsForm} onSubmit={event => void save(event, "grants")} className="space-y-4 rounded-md border border-(--border-app) bg-background p-4"><h2 className="font-semibold">{detail.mailbox.address} · {notice("grants")}</h2><p className="text-sm text-(--text-muted)">{notice("permissionsNotice")}</p><fieldset disabled={blocked} className="space-y-3">{grants.map((grant, index) => <div key={grant.id ?? index} className="grid items-center gap-3 rounded-md border border-(--border-app) p-3 lg:grid-cols-[100px_minmax(180px,1fr)_auto]"><CustomSelect disabled={blocked} aria-label={`${notice("grants")} ${index + 1}`} value={grant.kind} onChange={event => changeGrant(index, { kind: event.target.value as AdminSharedGrant["kind"] })} className={control}><option value="user">{t("users")}</option><option value="group">{t("groups")}</option></CustomSelect><input data-shared-grant-address aria-invalid={duplicateIndex === index || undefined} aria-describedby={duplicateIndex === index ? `shared-grant-${index}-error` : undefined} aria-label={`${labels("auth.common.email")} ${index + 1}`} required type="email" maxLength={320} value={grant.address} onChange={event => changeGrant(index, { address: event.target.value })} className={control} /><div className="flex flex-wrap items-center gap-3">{sharedRightKeys.map(key => <label key={key} className="flex min-h-11 items-center gap-1 text-xs"><input type="checkbox" checked={grant.rights[key]} onChange={event => changeGrant(index, { rights: normalizedSharedRights(grant.rights, key, event.target.checked) })} className="size-5" />{rightLabels[key]}</label>)}<Button size="sm" variant="ghost" onClick={() => { setConfirmed(false); setCompleted(false); setDuplicateIndex(-1); setGrants(current => current.filter((_, i) => i !== index)); }}>{t("delete")}</Button></div>{duplicateIndex === index && <p id={`shared-grant-${index}-error`} role="alert" className="text-sm text-(--status-danger)">{notice("duplicate")}</p>}</div>)}</fieldset><Button disabled={blocked || grants.length >= 100} onClick={() => { setConfirmed(false); setCompleted(false); setDuplicateIndex(-1); setGrants(current => [...current, { id: crypto.randomUUID(), kind: "user", address: "", rights: { mayRead: true, mayWrite: false, maySend: false, mayManage: false } }]); }}>{t("create")} · {notice("grants")}</Button>{JSON.stringify(grants) !== JSON.stringify(detail.grants) && <Button disabled={blocked} onClick={cancelGrants}>{t("cancel")}</Button>}<p className="text-xs text-(--text-muted)">{notice("rightsHint")}</p><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={blocked} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="size-5" />{t("confirmed")}</label><Button type="submit" variant="primary" loading={saving} disabled={blocked || !confirmed}>{t("save")}</Button></form>}
  </section>;
}
