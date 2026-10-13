import type { FolderId } from "@/types/mail";

export const SIDEBAR_GROUP_KEYS = ["mailboxGroup", "collaborationGroup", "mailManagementGroup", "shortcutsGroup"] as const;
export type SidebarGroups = Partial<Record<typeof SIDEBAR_GROUP_KEYS[number], boolean>>;
export type MailSelection = { folder: FolderId; mailboxId: string | null };
const DEFAULT_SELECTION: MailSelection = { folder: "inbox", mailboxId: null };
const SYSTEM_FOLDERS = ["all", "inbox", "starred", "drafts", "sent", "archive", "spam", "trash"];

export function navigationCookieName(kind: "groups" | "mail", account: string): string {
  return `gxmail_navigation_${kind}_v1_${encodeURIComponent(account.trim().toLowerCase())}`;
}

function decode(value: string | undefined): unknown {
  if (!value || value.length > 2048) return null;
  try { return JSON.parse(decodeURIComponent(value)); } catch { return null; }
}

export function sidebarGroupsFromCookie(value: string | undefined): SidebarGroups {
  const raw = decode(value);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const groups: SidebarGroups = {};
  for (const key of SIDEBAR_GROUP_KEYS) {
    const collapsed = (raw as Record<string, unknown>)[key];
    if (typeof collapsed === "boolean") groups[key] = collapsed;
  }
  return groups;
}

/** A saved custom ID is only a UI hint; the authenticated server snapshot decides whether it exists. */
export function mailSelectionFromCookie(value: string | undefined, mailboxes: { id: string; name: string; role: string | null }[]): MailSelection {
  const raw = decode(value);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_SELECTION;
  const { folder, mailboxId } = raw as Record<string, unknown>;
  if (typeof folder === "string" && SYSTEM_FOLDERS.includes(folder)) return { folder: folder as FolderId, mailboxId: null };
  if (folder === "custom" && typeof mailboxId === "string" && mailboxes.some(item => item.id === mailboxId && item.role === null && item.name.toLowerCase() !== "inbox")) {
    return { folder: "custom", mailboxId };
  }
  return DEFAULT_SELECTION;
}

export function persistNavigationCookie(name: string, value: SidebarGroups | MailSelection): void {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch { /* Keep CSR controls usable when the browser refuses cookies. */ }
}
