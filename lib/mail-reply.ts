import type { ComposeDraft, Email } from "@/types/mail";

/** 공유 계정 자신을 제외하고 수신자를 중복 제거한다. BCC는 답장에 노출하지 않는다. */
export function mailReplyDraft(message: Email, accountAddress: string, all: boolean, quoted: string): ComposeDraft {
  const unique = (addresses: string[]) => addresses.filter((address, index) => address && address.toLowerCase() !== accountAddress.toLowerCase() && addresses.findIndex((other) => other.toLowerCase() === address.toLowerCase()) === index);
  const target = message.replyTo || message.from.email;
  const recipient = message.folder === "sent" || target.toLowerCase() === accountAddress.toLowerCase()
    ? unique(message.to)[0] || target : target;
  const parent = message.messageId?.at(-1);
  return {
    fromAddress: accountAddress,
    to: recipient,
    ...(all ? { cc: unique([...message.to, ...(message.cc ?? [])]).filter((address) => address.toLowerCase() !== recipient.toLowerCase()).join(", "), replyAll: true } : {}),
    subject: /^re:/i.test(message.subject) ? message.subject : `RE: ${message.subject}`,
    body: quoted,
    ...(parent ? { inReplyTo: [parent], references: [...new Set([...(message.references ?? []), parent])].slice(-100) } : {}),
  };
}
