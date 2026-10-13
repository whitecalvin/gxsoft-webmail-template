import type { LiveMailbox } from "@/lib/tastemail/mail";

/** Mailbox usage sum (not unique message bytes); the account quota is shared. */
export function allMailboxStorage(mailboxes: readonly LiveMailbox[]): { used: number; limit: number } | null {
  if (!mailboxes.length) return null;
  let usedBytes = 0;
  const quotaBytes = mailboxes[0].quotaBytes;
  if (quotaBytes === null || !Number.isSafeInteger(quotaBytes) || quotaBytes <= 0) return null;
  for (const mailbox of mailboxes) {
    if (mailbox.usedBytes === null || !Number.isSafeInteger(mailbox.usedBytes) || mailbox.usedBytes < 0 || mailbox.quotaBytes !== quotaBytes) return null;
    usedBytes += mailbox.usedBytes;
    if (!Number.isSafeInteger(usedBytes)) return null;
  }
  return { used: usedBytes / 1024 / 1024, limit: quotaBytes / 1024 / 1024 / 1024 };
}
