"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import Glyph from "./MailboxGlyph";
import { Bookmark, Briefcase, Folder, Heart, Mail, Receipt, ShoppingBag, Star, Users, type LucideIcon } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { MailboxIconPickerTrigger } from "./MailboxIconPicker";
import { mailboxIconEntry } from "@/lib/mailbox-icon-catalog.mjs";
import { useInitialMailboxIcons, useServerMailboxIcons } from "@/context/mailbox-icon-context";
import { mirrorMailboxIconPreferences } from "@/lib/mailbox-icon-preferences";
import { IconPreferenceRecovery } from "./IconPreferenceRecovery";


const ICONS = { folder: Folder, briefcase: Briefcase, heart: Heart, star: Star, bookmark: Bookmark, shopping: ShoppingBag, receipt: Receipt, users: Users };
const CHANGE_EVENT = "gxmail:folder-icon-changed";
export function kindKey(account: string, mailboxId: string) {
  return `gxmail:folder-kind:v1:${encodeURIComponent(account)}:${encodeURIComponent(mailboxId)}`;
}
/** Creation kind is separate from the custom icon, so resetting icons preserves the default. */
export function rememberCreatedMailboxKind(accountAddress: string, mailboxId: string, kind: "folder" | "mailbox") {
  const account = accountAddress.trim().toLowerCase();
  if (!account || !mailboxId) return;
  try {
    window.localStorage.setItem(kindKey(account, mailboxId), kind);
    mirrorMailboxIconPreferences({ [kindKey(account, mailboxId)]: kind });
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* Browser-only preferences must not turn a confirmed creation into a failed mutation. */ }
}
export function resetMailboxIcons(accountAddress: string, storage: Storage = window.localStorage) {
  const account = accountAddress.trim().toLowerCase();
  if (!account) return;
  const prefix = `gxmail:folder-icon:v1:${encodeURIComponent(account)}:`;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  const defaults: Record<string, string> = {};
  for (const key of keys) if (key?.startsWith(prefix)) { storage.removeItem(key); defaults[key] = "default"; }
  mirrorMailboxIconPreferences(defaults);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(CHANGE_EVENT, onChange); };
}

export function PersonalFolderIcon({ mailboxId, editable = false }: { mailboxId: string; editable?: boolean }) {
  const initial = useInitialMailboxIcons();
  const { accountAddress, mailboxes } = useMail();
  const t = useTranslations("folderIcons");
  const mailbox = mailboxes.find((item) => item.id === mailboxId);
  // Names may change; mailbox IDs and normalized accounts keep preferences isolated.
  const account = (accountAddress ?? "").trim().toLowerCase();
  const server = useServerMailboxIcons(account);
  const key = `gxmail:folder-icon:v1:${encodeURIComponent(account)}:${encodeURIComponent(mailboxId)}`;
  const kind = useSyncExternalStore(subscribe, () => {
    if (server.matched) return server.preferences[kindKey(account, mailboxId)] ?? "mailbox";
    // 종류가 없는 서버 편지함을 임의로 폴더로 표시하지 않습니다.
    try { return (window.localStorage.getItem(kindKey(account, mailboxId)) ?? initial[kindKey(account, mailboxId)]) === "folder" ? "folder" : "mailbox"; } catch { return initial[kindKey(account, mailboxId)] === "folder" ? "folder" : "mailbox"; }
  }, () => server.matched ? server.preferences[kindKey(account, mailboxId)] ?? "mailbox" : initial[kindKey(account, mailboxId)] === "folder" ? "folder" : "mailbox");
  const value = useSyncExternalStore(subscribe, () => {
    if (server.matched) return server.preferences[key] ?? "default";
    try { return window.localStorage.getItem(key) ?? "default"; } catch { return "default"; }
  }, () => server.matched ? server.preferences[key] ?? "default" : initial[key] ?? "pending");
  useEffect(() => {
    if (!server.required && account && value !== "pending") mirrorMailboxIconPreferences({ [key]: value, [kindKey(account, mailboxId)]: kind });
  }, [account, key, mailboxId, value, kind, server.required]);
  const entry = mailboxIconEntry(value);
  const selected = Object.hasOwn(ICONS, value) || entry ? value : "default";
  const DefaultIcon = kind === "mailbox" ? Mail : Folder;
  const Icon = selected === "default" ? DefaultIcon : Object.hasOwn(ICONS, selected) ? ICONS[selected as keyof typeof ICONS] : null;
  const glyph = value === "pending" ? <span aria-hidden="true" className="inline-block size-[19px] shrink-0" /> : entry?.packageId === "emoji" ? <span aria-hidden="true" className="inline-flex size-[19px] shrink-0 items-center justify-center text-[19px] leading-none">{entry.native}</span> : Icon ? <Icon size={19} className="shrink-0" /> : <Glyph name={entry!.name} packageId={entry!.packageId} size={19} />;
  if (!editable || !account || !mailbox || mailbox.role !== null || mailbox.name.toLowerCase() === "inbox") return glyph;
  return <MailboxIconPickerTrigger value={selected} defaultIcon={DefaultIcon} label={t("change", { name: mailbox.name })}
    recovery={server.required ? <IconPreferenceRecovery /> : undefined}
    onChange={(next) => {
      if (next !== "default" && !mailboxIconEntry(next)) return;
      if (server.required) return server.update([{ target: { type: "mailbox", id: mailboxId }, icon: next, displayKind: kind === "folder" ? "folder" : "mailbox" }]);
      try {
        if (next === "default") window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, next);
        mirrorMailboxIconPreferences({ [key]: next, [kindKey(account, mailboxId)]: kind });
        window.dispatchEvent(new Event(CHANGE_EVENT));
      } catch { /* Storage restrictions leave the previous choice intact. */ }
    }}>{glyph}</MailboxIconPickerTrigger>;
}

export function SystemMailboxIcon({ folderId, label, defaultIcon: DefaultIcon, editable = false }: { folderId: string; label: string; defaultIcon: LucideIcon; editable?: boolean }) {
  const initial = useInitialMailboxIcons();
  const { accountAddress } = useMail();
  const t = useTranslations("folderIcons");
  const account = (accountAddress ?? "").trim().toLowerCase();
  const server = useServerMailboxIcons(account);
  const key = `gxmail:folder-icon:v1:${encodeURIComponent(account)}:${encodeURIComponent(`system:${folderId}`)}`;
  const value = useSyncExternalStore(subscribe, () => {
    if (server.matched) return server.preferences[key] ?? "default";
    try { return window.localStorage.getItem(key) ?? "default"; } catch { return "default"; }
  }, () => server.matched ? server.preferences[key] ?? "default" : initial[key] ?? "pending");
  useEffect(() => {
    if (!server.required && account && value !== "pending") mirrorMailboxIconPreferences({ [key]: value });
  }, [account, key, value, server.required]);
  const entry = mailboxIconEntry(value);
  const selected = Object.hasOwn(ICONS, value) || entry ? value : "default";
  const Icon = selected === "default" ? DefaultIcon : Object.hasOwn(ICONS, selected) ? ICONS[selected as keyof typeof ICONS] : null;
  const glyph = value === "pending" ? <span aria-hidden="true" className="inline-block size-[19px] shrink-0" /> : entry?.packageId === "emoji" ? <span aria-hidden="true" className="inline-flex size-[19px] shrink-0 items-center justify-center text-[19px] leading-none">{entry.native}</span> : Icon ? <Icon size={19} className="shrink-0" /> : <Glyph name={entry!.name} packageId={entry!.packageId} size={19} />;
  if (!editable || !account) return glyph;
  return <MailboxIconPickerTrigger value={selected} defaultIcon={DefaultIcon} label={t("change", { name: label })}
    recovery={server.required ? <IconPreferenceRecovery /> : undefined}
    onChange={(next) => {
      if (next !== "default" && !mailboxIconEntry(next)) return;
      if (server.required) return server.update([{ target: { type: "system", role: folderId === "spam" ? "junk" : folderId }, icon: next }]);
      try {
        if (next === "default") window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, next);
        mirrorMailboxIconPreferences({ [key]: next });
        window.dispatchEvent(new Event(CHANGE_EVENT));
      } catch { /* Preserve the current preference when storage is unavailable. */ }
    }}>{glyph}</MailboxIconPickerTrigger>;
}
