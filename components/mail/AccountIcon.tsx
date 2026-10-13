"use client";

import { useEffect, useSyncExternalStore } from "react";
import Glyph from "./MailboxGlyph";
import { UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useInitialMailboxIcons, useServerMailboxIcons } from "@/context/mailbox-icon-context";
import { useMail } from "@/context/mail-context";
import { Avatar } from "@/components/ui/Avatar";
import { MailboxIconPickerTrigger } from "./MailboxIconPicker";
import { mailboxIconEntry } from "@/lib/mailbox-icon-catalog.mjs";
import { accountIconKey, mirrorMailboxIconPreferences } from "@/lib/mailbox-icon-preferences";
import { IconPreferenceRecovery } from "./IconPreferenceRecovery";
import { useImageAssets } from "@/context/image-assets-context";

const CHANGE_EVENT = "gxmail:folder-icon-changed";
const SIZES = { sm: { className: "size-8", glyph: 20 }, md: { className: "size-10", glyph: 24 }, lg: { className: "size-11", glyph: 26 } };

function subscribe(change: () => void) {
  window.addEventListener("storage", change); window.addEventListener(CHANGE_EVENT, change);
  return () => { window.removeEventListener("storage", change); window.removeEventListener(CHANGE_EVENT, change); };
}

/** Account-scoped appearance only: never changes the server identity or shared permissions. */
export function AccountIcon({ name, targetAccountId, size = "md", editable = false }: {
  name: string; targetAccountId?: string; size?: keyof typeof SIZES; editable?: boolean;
}) {
  const { accountAddress } = useMail();
  const imageUrl = useImageAssets().avatar?.image?.url;
  const initial = useInitialMailboxIcons();
  const t = useTranslations("accountIcons");
  const account = (accountAddress ?? "").trim().toLowerCase();
  const server = useServerMailboxIcons(account);
  const key = accountIconKey(account, targetAccountId ? `shared:${targetAccountId}` : "self");
  const read = () => {
    if (server.matched) return server.preferences[key] ?? "default";
    try {
      const stored = window.localStorage.getItem(key) ?? "default";
      return stored === "default" || mailboxIconEntry(stored) ? stored : "default";
    } catch { return initial[key] ?? "default"; }
  };
  const value = useSyncExternalStore(subscribe, read, () => server.matched ? server.preferences[key] ?? "default" : initial[key] ?? "pending");
  useEffect(() => {
    if (!server.required && account && value !== "pending") mirrorMailboxIconPreferences({ [key]: value });
  }, [account, key, value, server.required]);
  const entry = value === "pending" || value === "default" ? null : mailboxIconEntry(value);
  const dimensions = SIZES[size];
  const glyph = imageUrl && !targetAccountId ? <Avatar name={name} src={imageUrl} size={size === "lg" ? "md" : size} /> : value === "pending" ? <span aria-hidden="true" className={`inline-block shrink-0 ${dimensions.className}`} />
    : value === "default" && !targetAccountId ? <Avatar name={name} size={size === "lg" ? "md" : size} />
    : <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-(--color-primary)/10 text-(--color-primary-ink) ${dimensions.className}`}>
      {entry?.packageId === "emoji" ? <span className="leading-none" style={{ fontSize: dimensions.glyph }}>{entry.native}</span>
        : entry ? <Glyph name={entry.name} packageId={entry.packageId} size={dimensions.glyph} /> : <Users size={dimensions.glyph} />}
    </span>;
  if (!editable || !account) return glyph;
  return <MailboxIconPickerTrigger value={value === "pending" ? "default" : value} defaultIcon={targetAccountId ? Users : UserRound}
    recovery={server.required ? <IconPreferenceRecovery /> : undefined}
    label={t(targetAccountId ? "changeShared" : "changeProfile", { name })} onChange={next => {
      if (next !== "default" && !mailboxIconEntry(next)) return;
      if (server.required) return server.update([{ target: targetAccountId ? { type: "sharedAccount", id: targetAccountId } : { type: "profile" }, icon: next }]);
      try {
        if (next === "default") window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, next);
        mirrorMailboxIconPreferences({ [key]: next });
        window.dispatchEvent(new Event(CHANGE_EVENT));
      } catch { /* Preserve the current choice when browser storage is restricted. */ }
    }}>{glyph}</MailboxIconPickerTrigger>;
}
