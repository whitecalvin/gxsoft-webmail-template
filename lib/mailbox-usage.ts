import type { Email, FolderId } from "@/types/mail";
import type { LiveMailbox } from "@/lib/tastemail/mail";
import { resolveMoveSource, movedMailboxIds } from "./mailbox-move.mjs";

export type PendingMailboxUsageMove = {
  id: string;
  snapshot: Pick<Email, "sizeBytes" | "mailboxIds">;
  target: Exclude<FolderId, "starred" | "custom"> | { mailboxId: string };
  sourceMailboxId: string | null;
};

export function confirmedMailSnapshot(value: unknown): Pick<Email, "sizeBytes" | "mailboxIds"> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { sizeBytes, mailboxIds } = value as Record<string, unknown>;
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0 ||
      !Array.isArray(mailboxIds) || mailboxIds.length === 0 || mailboxIds.length > 100 ||
      !mailboxIds.every((id) => typeof id === "string" && id.length > 0)) return undefined;
  return { sizeBytes, mailboxIds };
}

function projectMembershipChange(
  mailboxes: LiveMailbox[],
  email: Pick<Email, "sizeBytes" | "mailboxIds"> | undefined,
  after: Set<string>,
): LiveMailbox[] {
  const size = email?.sizeBytes;
  const memberships = email?.mailboxIds;
  if (!Number.isSafeInteger(size) || size === undefined || size < 0 || !memberships) return mailboxes;
  const before = new Set(memberships);
  const projected = mailboxes.map((mailbox) => {
    const delta = Number(after.has(mailbox.id)) - Number(before.has(mailbox.id));
    if (delta === 0 || mailbox.usedBytes === null) return mailbox;
    return { ...mailbox, usedBytes: mailbox.usedBytes + delta * size };
  });
  if (projected.some((mailbox) => mailbox.usedBytes !== null &&
      (!Number.isSafeInteger(mailbox.usedBytes) || mailbox.usedBytes < 0))) return mailboxes;
  return projected;
}

/** Project a confirmed JMAP move while the authoritative Mailbox/get refresh runs. */
export function projectMailboxUsageAfterMove(
  mailboxes: LiveMailbox[],
  email: Pick<Email, "sizeBytes" | "mailboxIds"> | undefined,
  target: Exclude<FolderId, "starred" | "custom"> | { mailboxId: string },
  sourceMailboxId: string | null,
): LiveMailbox[] {
  const memberships = email?.mailboxIds;
  if (!memberships) return mailboxes;

  const role = typeof target === "string" ? target === "spam" ? "junk" : target : null;
  const destination = typeof target === "string"
    ? mailboxes.find((mailbox) => mailbox.role === role)
    : mailboxes.find((mailbox) => mailbox.id === target.mailboxId && mailbox.role === null);
  if (!destination) return mailboxes;

  const sourceId = resolveMoveSource(mailboxes, memberships, sourceMailboxId);
  if (!sourceId) return mailboxes;
  const after = new Set(movedMailboxIds(memberships, sourceId, destination.id));

  return projectMembershipChange(mailboxes, email, after);
}

/** Overlay only moves awaiting confirmation on the last authoritative summary. */
export function projectPendingMailboxUsage(
  mailboxes: LiveMailbox[],
  pending: readonly PendingMailboxUsageMove[],
): LiveMailbox[] {
  return pending.reduce((current, move) =>
    projectMailboxUsageAfterMove(current, move.snapshot, move.target, move.sourceMailboxId), mailboxes);
}

/** A confirmed permanent delete removes the message from every mailbox. */
export function projectMailboxUsageAfterDestroy(
  mailboxes: LiveMailbox[],
  email: Pick<Email, "sizeBytes" | "mailboxIds"> | undefined,
): LiveMailbox[] {
  return projectMembershipChange(mailboxes, email, new Set());
}
