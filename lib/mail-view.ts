import type { Email, FolderId } from "@/types/mail";

export function mailViewKey(folder: FolderId, customMailboxId: string | null, position: number): string {
  return JSON.stringify([folder, customMailboxId, position]);
}

export function isCurrentMailView(mode: "live", loadedViewKey: string | null, viewKey: string): boolean {
  return loadedViewKey === viewKey;
}

export function mailPageTransitionPosition(loadedViewKey: string | null, viewKey: string): number | null {
  if (!loadedViewKey || loadedViewKey === viewKey) return null;
  try {
    const previous = JSON.parse(loadedViewKey);
    const next = JSON.parse(viewKey);
    if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== 3 || next.length !== 3 ||
        previous[0] !== next[0] || previous[1] !== next[1] || !Number.isSafeInteger(previous[2]) ||
        !Number.isSafeInteger(next[2]) || previous[2] < 0 || next[2] < 0) return null;
    return previous[2];
  } catch { return null; }
}

export function shouldRetainMailPage(lastSuccessfulViewKey: string | null, viewKey: string, failure: string): boolean {
  return (lastSuccessfulViewKey === viewKey || mailPageTransitionPosition(lastSuccessfulViewKey, viewKey) !== null) && failure !== "unauthorized" && failure !== "forbidden";
}

/** A detail response fills the body without replacing the current page's state. */
export function mergeLoadedMailDetail(summary: Email, detail: Email): Email {
  if (summary.id !== detail.id) return summary;
  return { ...detail, folder: summary.folder, unread: summary.unread, starred: summary.starred,
    sizeBytes: summary.sizeBytes, mailboxIds: summary.mailboxIds };
}

export function retainLoadedDetails(previous: Email[], incoming: Email[]): Email[] {
  const loaded = new Map(previous.filter((email) => email.detailLoaded === true).map((email) => [email.id, email]));
  return incoming.map((summary) => {
    if (summary.detailLoaded !== false) return summary;
    const detail = loaded.get(summary.id);
    if (!detail || detail.folder !== summary.folder || detail.receivedAt !== summary.receivedAt ||
        detail.subject !== summary.subject || detail.preview !== summary.preview ||
        detail.from.email !== summary.from.email) return summary;
    // Reuse the loaded body, not an old membership/size snapshot. These fields
    // drive click-time mailbox usage projections and belong to the latest read.
    return { ...detail, unread: summary.unread, starred: summary.starred,
      sizeBytes: summary.sizeBytes, mailboxIds: summary.mailboxIds };
  });
}

export function confirmMessageRead(emails: Email[], id: string): Email[] {
  return confirmMessageFlagInPage(emails, id, "seen", true);
}

export function confirmMessageFlag(email: Email, id: string, flag: "seen" | "starred", value: boolean): Email {
  if (email.id !== id) return email;
  return flag === "seen" ? { ...email, unread: !value } : { ...email, starred: value };
}

export function confirmMessageFlagInPage(emails: Email[], id: string, flag: "seen" | "starred", value: boolean): Email[] {
  if (!emails.some((email) => email.id === id && (flag === "seen" ? email.unread !== !value : email.starred !== value))) return emails;
  return emails.map((email) => confirmMessageFlag(email, id, flag, value));
}
