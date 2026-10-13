"use client";
import { CustomSelect } from "@/components/ui/CustomSelect";

import { useId, useRef, useState, type CSSProperties } from "react";
import { Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/overlay/Modal";
import { DialogActions } from "@/components/overlay/DialogActions";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { personalFolderInput } from "@/lib/tastemail/personal-folder-contract";
import { childFolderName, personalFolderTree, type PersonalFolderNode } from "@/lib/personal-folder-tree";
import { rememberCreatedMailboxKind } from "./PersonalFolderIcon";
import { useServerMailboxIcons } from "@/context/mailbox-icon-context";

export type FolderManagerRequest = { kind: "folder" | "mailbox" | "rename" | "delete"; mailboxId?: string; parentPath?: string };
export function PersonalFolderManager({ compact, request, onClose }: { compact: boolean; request?: FolderManagerRequest; onClose?: () => void }) {
  const t = useTranslations("personalFolders");
  const live = useTranslations("liveService");
  const folderSelectId = useId();
  const panelId = useId();
  const parentSelectId = useId();
  const { accountAddress, mailboxes, changeFolder, folderChangePending: pending, folderChangeUncertain: uncertain, refreshMailbox } = useMail();
  const [open, setOpen] = useState(!!request);
  const [target, setTarget] = useState(request?.mailboxId ?? "");
  const [name, setName] = useState(mailboxes.find(folder => folder.id === request?.mailboxId)?.name ?? "");
  const [parent, setParent] = useState(request?.parentPath ?? "");
  const tree = useTranslations("folderTree");
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(request?.kind === "delete");
  const [kind, setKind] = useState(request?.kind ?? "mailbox");
  const [createdKind, setCreatedKind] = useState<{ id: string; account: string; kind: "folder" | "mailbox" } | null>(null);
  const [kindSaving, setKindSaving] = useState(false);
  const account = (accountAddress ?? "").trim().toLowerCase();
  const icons = useServerMailboxIcons(account);
  const kindNotice = useTranslations("createdMailboxKind");
  const inFlight = useRef(false);
  const folders = mailboxes.filter(folder => folder.role === null && folder.name.toLowerCase() !== "inbox");
  const paths: string[] = [];
  const collectPaths = (nodes: PersonalFolderNode[]) => { for (const node of nodes) { paths.push(node.path); collectPaths(node.children); } };
  collectPaths(personalFolderTree(mailboxes));
  const selected = folders.find(folder => folder.id === target);
  const deleteBlocked = !selected || selected.totalEmails > 0 || folders.some(folder => folder.name.startsWith(`${selected.name}/`));
  const disabled = pending || uncertain || kindSaving || !!createdKind;
  async function submit(operation: "create" | "rename" | "delete") {
    if (disabled || inFlight.current) return;
    if (operation === "delete" && deleteBlocked) return;
    if (operation === "rename" && selected && folders.some(folder => folder.name.startsWith(`${selected.name}/`))) { setStatus(t("conflict")); return; }
    if (operation === "create" && parent && !paths.includes(parent)) { setStatus(t("conflict")); return; }
    const input = personalFolderInput(operation === "create" ? { operation, name: childFolderName(parent, name) }
      : operation === "rename" ? { operation, mailboxId: target, name } : { operation, mailboxId: target });
    if (!input) { setStatus(t("invalid")); return; }
    inFlight.current = true;
    setStatus(null);
    try {
      const createdId = await changeFolder(input);
      if (operation === "create" && createdId && accountAddress && (kind === "folder" || kind === "mailbox")) {
        // 새 편지함은 서버의 기본 유형입니다. 폴더로 표시할 때만 별도 설정을 저장합니다.
        if (icons.required && kind === "folder") {
          setCreatedKind({ id: createdId, account, kind });
          setName(""); setKindSaving(true);
          if (!await icons.saveCreatedKind(createdId, kind)) { setStatus(kindNotice("pending")); return; }
          setCreatedKind(null);
        } else if (!icons.required) rememberCreatedMailboxKind(accountAddress, createdId, kind);
      }
      setStatus(t("saved")); setName(""); setTarget(""); setParent(""); setConfirmDelete(false);
      if (operation === "create" || operation === "delete") { setOpen(false); onClose?.(); }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "mutation_uncertain";
      setStatus(reason === "mutation_uncertain" ? t("uncertain") : reason === "invalid_request" ? t("invalid")
        : reason === "not_found" || reason === "notFound" || reason === "conflict" ? t("conflict")
        : ["unauthorized", "forbidden", "rateLimited"].includes(reason) ? live(reason) : live("unavailable"));
    } finally { inFlight.current = false; setKindSaving(false); }
  }
  async function retryKind() {
    if (!createdKind || createdKind.account !== account || inFlight.current) return;
    inFlight.current = true; setKindSaving(true);
    try {
      if (createdKind.kind === "mailbox" || await icons.saveCreatedKind(createdKind.id, createdKind.kind)) { setCreatedKind(null); setStatus(t("saved")); setOpen(false); onClose?.(); }
      else setStatus(kindNotice("pending"));
    } catch { setStatus(kindNotice("pending")); }
    finally { inFlight.current = false; setKindSaving(false); }
  }
  const close = () => { if (!pending && !inFlight.current) { setOpen(false); onClose?.(); } };
  const openCreateMailbox = () => {
    if (disabled || inFlight.current) return;
    setKind("mailbox"); setTarget(""); setName(""); setParent(""); setStatus(null); setConfirmDelete(false); setOpen(true);
  };
  const title = kind === "delete" ? t("delete") : target ? t("rename") : t(kind === "folder" ? "newFolder" : "newMailbox");
  return (
    <>
      {!request ? <div className="min-w-0 pt-2"><div className={compact ? "flex justify-center" : "flex items-center justify-center px-3"}>
        <Tooltip content={t("newMailbox")}>
          <button type="button" aria-label={t("newMailbox")} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={openCreateMailbox}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-(--text-muted) hover:bg-(--control-hover) focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-45 md:[@media(pointer:fine)]:size-8">
            <Plus size={18} aria-hidden="true" />
          </button>
        </Tooltip>
      </div></div> : null}
      {open && confirmDelete && selected ? createPortal(<ConfirmDialog tone="destructive" title={t("delete")} description={`${t("confirm")} ${selected.name}`}
        confirmLabel={t("delete")} cancelLabel={t("cancel")} confirmDisabled={disabled || deleteBlocked}
        onConfirm={() => void submit("delete")} onCancel={() => { if (pending || inFlight.current) return; if (kind === "delete") close(); else setConfirmDelete(false); }} />, document.body) : null}
      {open && !confirmDelete ? createPortal(<Modal onClose={close} dismissible={!pending && !kindSaving} ariaLabel={title} maxWidth={440}>
      <div className="flex items-center justify-between border-b border-(--border-app) px-4 py-3"><h2 className="font-semibold">{title}</h2><Button size="icon" variant="ghost" aria-label={t("cancel")} disabled={pending} onClick={close}><X size={18} /></Button></div>
      <div id={panelId} className="grid max-h-[70dvh] min-w-0 grid-cols-1 gap-3 overflow-y-auto p-4 text-sm" style={{ "--radius-app": "0.5rem" } as CSSProperties}>
        {!request && target ? <div className="grid gap-1.5">
          <label htmlFor={folderSelectId} className="font-medium text-(--text-muted)">{t("folder")}</label>
          <CustomSelect id={folderSelectId} value={target} disabled={disabled} className="h-11 min-w-0 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm text-foreground outline-none focus-visible:border-(--color-primary-ink) focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:opacity-60"
            onChange={event => { const id = event.target.value; setTarget(id); setName(folders.find(folder => folder.id === id)?.name ?? ""); setConfirmDelete(false); setStatus(null); }}>
            <option value="">{t("create")}</option>
            {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </CustomSelect>
        </div> : null}
        {kind !== "delete" && !confirmDelete ? <form className="grid min-w-0 grid-cols-1 gap-3 [&_label]:text-xs [&_label]:text-(--text-muted)" onSubmit={event => { event.preventDefault(); void submit(target ? "rename" : "create"); }}>
          {!target ? <div className="grid gap-1.5">
            <label htmlFor={parentSelectId} className="font-medium">{tree("parent")}</label>
            <CustomSelect id={parentSelectId} value={parent} disabled={disabled} onChange={event => setParent(event.target.value)} className="h-11 min-w-0 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-(--focus-ring)">
              <option value="">{tree("root")}</option>
              {paths.map(path => <option key={path} value={path}>{path}</option>)}
            </CustomSelect>
          </div> : null}
          <Input label={t("name")} value={name} className="h-11" disabled={disabled} required
            data-modal-autofocus={target ? true : undefined}
            onFocus={event => { if (target) event.currentTarget.select(); }}
            onChange={event => { setName(event.target.value); setConfirmDelete(false); }} />
          <DialogActions>
            <Button type="submit" size="sm" variant="primary" className="shadow-none" loading={pending} disabled={disabled || !name.trim() || (!!target && !selected)}>{t(target ? "rename" : "create")}</Button>
            <Button size="sm" disabled={pending || kindSaving} onClick={close}>{t("cancel")}</Button>
          </DialogActions>
        </form> : null}
        {target && !request && !confirmDelete && kind !== "delete" ? <>
          <DialogActions><Button size="sm" variant="danger" disabled={disabled || deleteBlocked} onClick={() => setConfirmDelete(true)}>{t("delete")}</Button></DialogActions>
          {deleteBlocked ? <p className="text-(--text-muted)">{t("emptyOnly")}</p> : null}
        </> : null}
        {status || uncertain ? <p role="status" className="break-words">{uncertain ? t("uncertain") : status}</p> : null}
        {createdKind && createdKind.account === account ? <Button size="sm" loading={kindSaving} disabled={kindSaving} onClick={() => { void retryKind(); }}>{kindNotice("retry")}</Button> : null}
        {uncertain ? <Button size="sm" onClick={refreshMailbox}>{live("retry")}</Button> : null}
      </div></Modal>, document.body) : null}
    </>
  );
}
