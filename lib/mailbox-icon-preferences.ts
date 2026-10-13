import { mailboxIconEntry } from "./mailbox-icon-catalog.mjs";

export const MAILBOX_ICON_COOKIE = "gxmail-mailbox-icons-v1";
const MAX_COOKIE_LENGTH = 3000;
export type MailboxIconPreferences = Record<string, string>;

function validPreference(key: string, value: unknown): value is string {
  if (key.length > 512 || typeof value !== "string") return false;
  if (/^gxmail:folder-kind:v1:[^:]+:[^:]+$/.test(key)) return value === "folder" || value === "mailbox";
  return /^gxmail:(?:folder-icon|account-icon):v1:[^:]+:[^:]+$/.test(key) && (value === "default" || Boolean(mailboxIconEntry(value)));
}

export function accountIconKey(accountAddress: string, target = "self") {
  return `gxmail:account-icon:v1:${encodeURIComponent(accountAddress.trim().toLowerCase())}:${encodeURIComponent(target)}`;
}

export function parseMailboxIconPreferences(raw?: string): MailboxIconPreferences {
  if (!raw || raw.length > MAX_COOKIE_LENGTH) return {};
  try {
    const value = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(value)) return {};
    return Object.fromEntries(value.filter(item => Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && validPreference(item[0], item[1])));
  } catch { return {}; }
}

/** Presentation-only bounded cookie; never contains a session token or mail content. */
export function mirrorMailboxIconPreferences(updates: MailboxIconPreferences) {
  try {
    const raw = document.cookie.split("; ").find(cookie => cookie.startsWith(`${MAILBOX_ICON_COOKIE}=`))?.slice(MAILBOX_ICON_COOKIE.length + 1);
    const entries = new Map(Object.entries(parseMailboxIconPreferences(raw)));
    for (const [key, value] of Object.entries(updates)) {
      if (!validPreference(key, value)) continue;
      entries.delete(key); entries.set(key, value);
    }
    let encoded = encodeURIComponent(JSON.stringify([...entries]));
    while (encoded.length > MAX_COOKIE_LENGTH && entries.size) {
      entries.delete(entries.keys().next().value!);
      encoded = encodeURIComponent(JSON.stringify([...entries]));
    }
    if (encoded === raw) return;
    document.cookie = `${MAILBOX_ICON_COOKIE}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch { /* Restricted cookie storage must not prevent choosing an icon. */ }
}
