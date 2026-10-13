"use client";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AdminPageActions } from "./AdminShell";
import { Button } from "@/components/ui/Button";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { adminInitialReadGate } from "@/lib/admin-initial-read";
type Item = { id: string; recipient: string; envelopeSender: string | null; subject: string | null; sizeBytes: string; spamScore: number; createdAt: string };
type Page = { items: Item[]; hasMore: boolean; nextBeforeCreatedAt: string | null; nextBeforeId: string | null };
export function AdminQuarantine({ initialPage, initialError, onBusyChange }: { initialPage?: Page; initialError?: string; onBusyChange?: (busy: boolean) => void }) {
  const t = useTranslations("adminBulk"), service = useTranslations("liveService"), manage = useTranslations("adminManage");
  const [page, setPage] = useState<Page | null>(initialPage ?? null), [selected, setSelected] = useState<string[]>([]), [cursor, setCursor] = useState("");
  const [history, setHistory] = useState<string[]>([]), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false);
  const [action, setAction] = useState("inbox"), [confirmed, setConfirmed] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState<string | null>(initialError ?? null), [completed, setCompleted] = useState<number | null>(null);
  const initialRead = useRef(adminInitialReadGate(initialPage !== undefined || initialError !== undefined, "0|"));
  const [detail, setDetail] = useState<{ id: string; textBody: string } | null>(null);
  const flight = useRef(false), writeBlocked = useRef(false), detailRequest = useRef(0), alive = useRef(true);
  const retiredSelection = useRef<string[] | null>(null);
  const [confirmation, setConfirmation] = useState<{ ids: string[]; action: string } | null>(null);
  const approvedResolution = useRef<{ ids: string[]; action: string } | null>(null);
  useEffect(() => { onBusyChange?.(saving); }, [saving, onBusyChange]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (initialRead.current(`${revision}|${cursor}`)) return;
    const controller = new AbortController(); let active = true;
    async function load() {
    setSelected([]); setConfirmed(false); setBusy(true); setError(current => current === "conflict" ? current : null);
    await fetch(`/api/mail/quarantine?${cursor}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403 ? "forbidden" : response.status === 401 ? "unauthorized" : "retryable");
      const data = await response.json(); if (active) setPage(data);
    }).catch(error => { if (active) { setPage(null); setError(error.message); } }).finally(() => { if (active) setBusy(false); });
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [cursor, revision]);
  async function view(id: string) {
    const request = ++detailRequest.current; setDetail(null);
    try { const response = await fetch(`/api/mail/quarantine/${id}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(); const result = await response.json(); if (alive.current && request === detailRequest.current) setDetail({ id, textBody: result.textBody }); }
    catch { if (alive.current && request === detailRequest.current) setError("retryable"); }
  }
  async function resolve() {
    if (!confirmed || !selected.length || selected === retiredSelection.current || flight.current || uncertain || writeBlocked.current) return;
    if (approvedResolution.current?.ids !== selected || approvedResolution.current.action !== action) {
      setConfirmation({ ids: selected, action });
      return;
    }
    approvedResolution.current = null;
    flight.current = true; onBusyChange?.(true); setSaving(true); setError(null); setCompleted(null);
    try {
      const response = await fetch("/api/mail/admin/quarantine-bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected, action: action === "discard" ? "discard" : "release", ...(action !== "discard" ? { target: action } : {}), confirmed: true }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok || result.status !== "updated") { if (response.ok || response.status >= 500 || result.status === "mutationUncertain") writeBlocked.current = true; if (response.status === 409) retiredSelection.current = selected; if (alive.current) { setError(result.status); if (writeBlocked.current) setUncertain(true); if (response.status === 409) { setSelected([]); setConfirmed(false); setRevision(n => n + 1); } } return; }
      retiredSelection.current = selected;
      if (alive.current) { setCompleted(result.count); setSelected([]); setConfirmed(false); setDetail(null); detailRequest.current++; setRevision(n => n + 1); }
    } catch { writeBlocked.current = true; if (alive.current) { setUncertain(true); setError("mutationUncertain"); } }
    finally { flight.current = false; if (alive.current) { setSaving(false); onBusyChange?.(false); } }
  }
  return <section className="space-y-4" aria-busy={busy || saving}>
    {confirmation && <ConfirmDialog tone={confirmation.action === "discard" ? "destructive" : "warning"} title={t(confirmation.action)} description={t("confirm", { count: confirmation.ids.length })} confirmLabel={t(confirmation.action)} cancelLabel={manage("cancel")} confirmDisabled={busy || saving || uncertain || confirmation.ids !== selected || confirmation.action !== action || !confirmed} onCancel={() => setConfirmation(null)} onConfirm={() => {
      if (busy || saving || uncertain || confirmation.ids !== selected || confirmation.action !== action || !confirmed) return;
      approvedResolution.current = confirmation;
      setConfirmation(null);
      void resolve();
    }} />}
    <AdminPageActions><Button disabled={busy || saving} onClick={() => setRevision(n => n + 1)}>{manage("refresh")}</Button></AdminPageActions>
    {busy && <p role="status">{service("loading")}</p>}
    {(error || uncertain) && <SystemErrorNotice message={uncertain ? manage("uncertain") : service(["forbidden", "unauthorized", "conflict", "rateLimited"].includes(error ?? "") ? error! : "retryable")} />}
    {completed !== null && <p role="status">{t("completed", { count: completed })}</p>}
    <fieldset disabled={busy || saving || uncertain} className="flex flex-wrap items-center gap-3">
      <CustomSelect aria-label={t("action")} value={action} onChange={event => { setAction(event.target.value); setConfirmed(false); }} className="min-h-11 rounded-lg border border-(--border-app) bg-background px-3">{["inbox", "junk", "discard"].map(value => <option key={value} value={value}>{t(value)}</option>)}</CustomSelect>
      <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t("confirm", { count: selected.length })}</label>
      <Button variant={action === "discard" ? "danger" : "primary"} disabled={!selected.length || !confirmed || busy || saving || uncertain} onClick={() => void resolve()}>{manage("save")}</Button>
    </fieldset>
    {page && <div className="overflow-x-auto rounded-xl border border-(--border-app) bg-background"><table className="w-full text-left text-sm"><thead><tr><th className="p-3"><input type="checkbox" aria-label={t("selectAll")} disabled={busy || saving || uncertain || !page.items.length} checked={page.items.length > 0 && selected.length === page.items.length} onChange={event => { setSelected(event.target.checked ? page.items.map(item => item.id) : []); setConfirmed(false); }} /></th>{["subject", "recipient", "sender", "score", "size", "date"].map(key => <th scope="col" key={key} className="p-3">{t(key)}</th>)}<th scope="col">{t("view")}</th></tr></thead><tbody>{page.items.map(item => <tr key={item.id} className="border-t border-(--border-app)"><td className="p-3"><input type="checkbox" aria-label={item.subject ?? item.recipient} disabled={busy || saving || uncertain} checked={selected.includes(item.id)} onChange={event => { setSelected(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id)); setConfirmed(false); }} /></td>{[item.subject, item.recipient, item.envelopeSender, item.spamScore, item.sizeBytes, item.createdAt].map((value, index) => <td key={index} className="max-w-64 break-words p-3">{value ?? "—"}</td>)}<td className="p-3"><Button disabled={saving} onClick={() => void view(item.id)}>{t("view")}</Button></td></tr>)}</tbody></table>{!page.items.length && <p className="p-4">{t("empty")}</p>}</div>}
    {detail && <section className="space-y-3 rounded-xl border border-(--border-app) bg-background p-5"><Button onClick={() => { detailRequest.current++; setDetail(null); }}>{manage("cancel")}</Button><pre className="whitespace-pre-wrap break-words text-sm">{detail.textBody}</pre></section>}
    <footer className="flex justify-between"><Button disabled={busy || saving || !history.length} onClick={() => { setCursor(history[history.length - 1]); setHistory(items => items.slice(0, -1)); }}>{t("previous")}</Button><Button disabled={busy || saving || !page?.hasMore} onClick={() => { if (page?.nextBeforeCreatedAt && page.nextBeforeId) { setHistory(items => [...items, cursor]); setCursor(new URLSearchParams({ beforeCreatedAt: page.nextBeforeCreatedAt, beforeId: page.nextBeforeId }).toString()); } }}>{t("next")}</Button></footer>
  </section>;
}
