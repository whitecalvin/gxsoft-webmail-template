import type { LiveSearchPage } from "./mail";
import type { Email } from "../../types/mail";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function natural(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// Validate the normalized message shared by mailbox lists and detail views.
export function requireLiveMailMessage(value: unknown, expectedId: string, requireDetail = false): Email {
  const item = object(value), from = object(item?.from);
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
  if (!item || !expectedId || item.id !== expectedId || typeof item.detailLoaded !== "boolean" ||
      (requireDetail && item.detailLoaded !== true) || !from ||
      typeof from.name !== "string" || typeof from.email !== "string" ||
      typeof item.subject !== "string" || typeof item.preview !== "string" || !strings(item.body) || !strings(item.to) ||
      typeof item.receivedAt !== "string" || !Number.isFinite(Date.parse(item.receivedAt)) ||
      typeof item.unread !== "boolean" || typeof item.starred !== "boolean" ||
      !["inbox", "starred", "drafts", "sent", "archive", "spam", "trash", "custom"].includes(item.folder as string) ||
      !(item.htmlBody === undefined || item.htmlBody === null || typeof item.htmlBody === "string") ||
      !(item.blockedExternalImages === undefined || typeof item.blockedExternalImages === "boolean") ||
      !(item.bodyText === undefined || typeof item.bodyText === "string") ||
      !(item.sizeBytes === undefined || natural(item.sizeBytes)) ||
      ["cc", "bcc", "mailboxIds", "messageId", "inReplyTo", "references"].some(key => item[key] !== undefined && !strings(item[key])) ||
      !(item.replyTo === undefined || typeof item.replyTo === "string")) throw new Error("unavailable");
  if (item.attachments !== undefined && (!Array.isArray(item.attachments) || !item.attachments.every(value => {
    const file = object(value);
    return file && typeof file.blobId === "string" && !!file.blobId && typeof file.name === "string" &&
      typeof file.type === "string" && natural(file.size) &&
      (file.disposition === undefined || file.disposition === "inline" || file.disposition === "attachment") &&
      (file.cid === undefined || file.cid === null || typeof file.cid === "string");
  }))) throw new Error("unavailable");
  return item as unknown as Email;
}

// An ID match alone cannot make body.map() or attachment links safe.
export function requireLiveSearchDetail(value: unknown, expectedId: string): Email {
  return requireLiveMailMessage(object(value)?.message, expectedId, true);
}

// Check the same-origin search projection before rendering it, not raw JMAP data.
export function requireLiveSearchPage(value: unknown): LiveSearchPage {
  const page = object(value);
  if (!page || !natural(page.position) || !natural(page.total) || !natural(page.limit) || page.limit === 0 ||
      !Array.isArray(page.messages) || page.messages.length > page.limit || page.messages.length > page.total) {
    throw new Error("unavailable");
  }
  const ids = new Set<string>();
  for (const value of page.messages) {
    const item = object(value);
    const from = object(item?.from);
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || !from ||
        typeof from.name !== "string" || typeof from.email !== "string" ||
        typeof item.subject !== "string" || typeof item.preview !== "string" ||
        typeof item.receivedAt !== "string" || !Number.isFinite(Date.parse(item.receivedAt)) ||
        typeof item.mailboxName !== "string" || !(item.mailboxRole === null || typeof item.mailboxRole === "string") ||
        !Array.isArray(item.body) || !item.body.every((paragraph) => typeof paragraph === "string") ||
        !(item.htmlBody === undefined || item.htmlBody === null || typeof item.htmlBody === "string") ||
        !(item.detailLoaded === undefined || typeof item.detailLoaded === "boolean") ||
        !(item.blockedExternalImages === undefined || typeof item.blockedExternalImages === "boolean") ||
        ["to", "cc", "bcc"].some(key => item[key] !== undefined && (!Array.isArray(item[key]) || !item[key].every(value => typeof value === "string"))) ||
        !(item.replyTo === undefined || typeof item.replyTo === "string")) {
      throw new Error("unavailable");
    }
    if (item.attachments !== undefined) {
      if (!Array.isArray(item.attachments) || !item.attachments.every((value) => {
        const file = object(value);
        return file && typeof file.blobId === "string" && !!file.blobId && typeof file.name === "string" &&
          typeof file.type === "string" && natural(file.size) &&
          (file.disposition === undefined || file.disposition === "inline" || file.disposition === "attachment") &&
          (file.cid === undefined || file.cid === null || typeof file.cid === "string");
      })) throw new Error("unavailable");
    }
    ids.add(item.id);
  }
  return page as LiveSearchPage;
}
