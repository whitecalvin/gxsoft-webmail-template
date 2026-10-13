import type { ComposeDraft } from "@/types/mail";
import type { UserSettings } from "@/types/user-settings";
export function validDefaultRecipients(value: string): boolean {
  if (!value.trim()) return true;
  const addresses = value.split(/[,;]+/).map((item) => item.trim());
  return addresses.length <= 100 && addresses.every((address) => address.length <= 254 && /^[^\s@<>"(),;]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(address));
}
export function sendingComposeDefaults(initial: ComposeDraft, settings: UserSettings["sending"], shared: boolean) {
  const fresh = !shared && !initial.previousDraftId && !initial.to && !initial.subject && !initial.body && !initial.htmlBody && !initial.attachments?.length && !initial.inReplyTo?.length;
  const recipients = (value: string) => validDefaultRecipients(value) ? value.split(/[,;]+/).map((item) => item.trim()).filter(Boolean).join(", ") : "";
  return {
    cc: initial.cc || (fresh ? recipients(settings.defaultCc) : ""),
    bcc: initial.bcc || (fresh ? recipients(settings.defaultBcc) : ""),
    // 기존 메일의 명시적 HTML은 기본 작성 형식보다 우선하여 복원한다.
    mode: initial.htmlBody ? "rich" as const : settings.composeMode === "html" ? "rich" as const : "plain" as const,
  };
}
export function replyQuote(original: string, style: UserSettings["sending"]["quoteStyle"]): string {
  if (style === "none") return "";
  if (style === "inline") return `\n\n${original.split("\n").map((line) => `> ${line}`).join("\n")}`;
  return `\n\n${original}`;
}
