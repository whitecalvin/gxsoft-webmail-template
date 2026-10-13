"use client";
import { DialogActions } from "@/components/overlay/DialogActions";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { useMail } from "@/context/mail-context";
import { useServerMailboxIcons } from "@/context/mailbox-icon-context";
import { planIconPreferenceImport, type IconImportPlan } from "@/lib/icon-preference-import";
import { iconPreferenceKey } from "@/lib/mailbox-icon-snapshot";
import { iconTargetKey } from "@/lib/tastemail/icon-preferences-contract";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/overlay/Modal";

export function IconPreferenceImport() {
  const t = useTranslations("iconImport"), common = useTranslations("common"), folders = useTranslations("sidebar"), kinds = useTranslations("mailboxKinds");
  const inbox = useTranslations("inboxMenu");
  const { accountAddress, mailboxes } = useMail();
  const account = (accountAddress ?? "").trim().toLowerCase();
  const server = useServerMailboxIcons(account);
  const heading = useId();
  const pending = useRef(false), generation = useRef(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ account: string; revision: number; plan: IconImportPlan } | null>(null);
  useEffect(() => () => { generation.current++; }, []);
  const ready = server.required && server.matched && server.status === "ready" && !!server.snapshot;
  function prepare() {
    if (!ready || !server.snapshot || pending.current) return;
    const local: Record<string, unknown> = {};
    try {
      // Read only known preference keys for the authenticated account and accessible targets.
      for (const target of server.snapshot.availableTargets) {
        const key = iconPreferenceKey(account, target);
        const value = window.localStorage.getItem(key);
        if (value !== null) local[key] = value;
        if (target.type === "mailbox") {
          const key = `gxmail:folder-kind:v1:${encodeURIComponent(account)}:${encodeURIComponent(target.id)}`;
          const value = window.localStorage.getItem(key);
          if (value !== null) local[key] = value;
        }
      }
    } catch { setNotice(t("storageError")); return; }
    const plan = planIconPreferenceImport(account, server.snapshot, local);
    if (plan.blocked || !plan.changes.length) { setNotice(t(plan.blocked ? "failed" : "empty")); return; }
    setNotice(null);
    setPreview({ account, revision: server.snapshot.revision, plan });
  }
  async function confirm() {
    if (!preview || pending.current) return;
    if (!ready || preview.account !== account || preview.revision !== server.snapshot?.revision) { setNotice(t("stale")); setPreview(null); return; }
    const current = generation.current;
    pending.current = true; setSaving(true);
    try {
      const saved = await server.importChoices(preview.revision, preview.plan.changes);
      if (current !== generation.current) return;
      setNotice(t(saved ? "success" : "failed"));
      setPreview(null);
    } catch {
      if (current === generation.current) { setNotice(t("failed")); setPreview(null); }
    } finally {
      pending.current = false;
      if (current === generation.current) setSaving(false);
    }
  }
  if (!server.required) return null;
  return <div className="grid gap-2 border-t border-(--border-app) pt-3">
    <p className="text-sm text-(--text-muted)">{t("description")}</p>
    <Button disabled={!ready || saving} onClick={prepare}>{t("preview")}</Button>
    {notice ? <p role="status" className="text-sm text-(--text-muted)">{notice}</p> : null}
    {preview && preview.account === account ? createPortal(<Modal onClose={() => { if (!pending.current) setPreview(null); }} dismissible={!saving} labelledBy={heading} maxWidth={480}>
      <div className="grid gap-3 p-4">
        <h2 id={heading} className="font-semibold">{t("title")}</h2>
        <p className="text-sm text-(--text-muted)">{t("summary", { count: preview.plan.changes.length, remaining: preview.plan.remaining, skipped: preview.plan.skipped })}</p>
        <ul className="max-h-[45dvh] overflow-y-auto divide-y divide-(--border-app)">
          {preview.plan.changes.map(entry => {
            const target = entry.target;
            const label = target.type === "profile" ? account : target.type === "system" ? target.role === "unread" ? inbox("unread") : folders(target.role === "junk" ? "spam" : target.role)
              : target.type === "mailbox" ? mailboxes.find(item => item.id === target.id)?.name ?? kinds("mailbox") : t("shared");
            return <li key={iconTargetKey(target)} className="grid gap-1 py-2 text-sm"><span className="break-words font-medium">{label}</span><span className="break-all text-xs text-(--text-muted)">{entry.icon}{entry.displayKind ? ` · ${kinds(entry.displayKind)}` : ""}</span></li>;
          })}
        </ul>
        <DialogActions><Button variant="primary" loading={saving} disabled={!ready || preview.revision !== server.snapshot?.revision} onClick={() => { void confirm(); }}>{t("confirm")}</Button><Button disabled={saving} onClick={() => setPreview(null)}>{common("cancel")}</Button></DialogActions>
      </div>
    </Modal>, document.body) : null}
  </div>;
}
