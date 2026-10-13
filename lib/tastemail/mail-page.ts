import type { LiveMailPage, LiveMailboxSummary } from "./mail";
import { requireLiveMailMessage } from "./search-page";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function natural(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// Validate usage/count projections before they enter sidebar state.
export function requireLiveMailboxSummary(value: unknown, expectedAccountId?: string): LiveMailboxSummary {
  const page = object(value);
  if (!page || typeof page.accountId !== "string" || !page.accountId ||
      (expectedAccountId !== undefined && page.accountId !== expectedAccountId) ||
      typeof page.username !== "string" || !Array.isArray(page.mailboxes)) throw new Error("unavailable");
  const ids = new Set<string>();
  if (page.allCounts !== undefined) {
    const counts = object(page.allCounts);
    if (!counts || !natural(counts.total) || !natural(counts.unread) || counts.unread > counts.total) throw new Error("unavailable");
  }
  for (const value of page.mailboxes) {
    const mailbox = object(value);
    if (!mailbox || typeof mailbox.id !== "string" || !mailbox.id || ids.has(mailbox.id) ||
        typeof mailbox.name !== "string" || !(mailbox.role === null || typeof mailbox.role === "string") ||
        !natural(mailbox.totalEmails) || !natural(mailbox.unreadEmails) ||
        !(mailbox.usedBytes === null || natural(mailbox.usedBytes)) ||
        !(mailbox.quotaBytes === null || natural(mailbox.quotaBytes))) throw new Error("unavailable");
    ids.add(mailbox.id);
  }
  return page as LiveMailboxSummary;
}

// A page may be empty beyond its last position; keep the existing recovery flow.
export function requireLiveMailPage(value: unknown, expectedAccountId?: string): LiveMailPage {
  requireLiveMailboxSummary(value, expectedAccountId);
  const page = object(value)!;
  if (!(page.mailboxId === null || typeof page.mailboxId === "string" && !!page.mailboxId) ||
      !natural(page.position) || !natural(page.total) || !natural(page.limit) || page.limit === 0 ||
      !Array.isArray(page.messages) || page.messages.length > page.limit || page.messages.length > page.total) {
    throw new Error("unavailable");
  }
  const ids = new Set<string>();
  for (const value of page.messages) {
    const item = object(value);
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)) throw new Error("unavailable");
    requireLiveMailMessage(item, item.id);
    ids.add(item.id);
  }
  return page as LiveMailPage;
}
