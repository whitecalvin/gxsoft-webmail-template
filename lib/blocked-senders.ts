import type { LiveMailRule, LiveMailRules, MailRuleInput } from "./tastemail/mail-rules";

export type BlockedSender = { type: "email" | "domain"; value: string };
const NAME = "GXWebMail blocked sender";
export function normalizeBlockedSender(input: string): BlockedSender | null {
  const value = input.trim().toLowerCase();
  if (value.length > 254) return null;
  const parts = value.split("@");
  const domain = parts.length === 1 ? parts[0] : parts.length === 2 ? parts[1] : "";
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain) || domain.length > 253) return null;
  if (parts.length === 1) return { type: "domain", value };
  if (!parts[0] || parts[0].length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(parts[0]) || parts[0].startsWith(".") || parts[0].endsWith(".") || parts[0].includes("..")) return null;
  return { type: "email", value };
}
const quote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
export function blockedSenderSource(sender: BlockedSender, mailbox: string): string {
  return `# gxwebmail-blocked-sender-v1 ${sender.type} ${sender.value}\nrequire "fileinto";\nif address ${sender.type === "domain" ? ":domain " : ""}:is "from" ${quote(sender.value)} { fileinto ${quote(mailbox)}; stop; }\n`;
}
export function managedBlockedSender(rule: LiveMailRule): BlockedSender | null {
  if (rule.name !== NAME || rule.kind !== "filter") return null;
  const match = /^# gxwebmail-blocked-sender-v1 (email|domain) (\S+)\n/.exec(rule.source);
  const mailbox = /fileinto "((?:[^"\\]|\\["\\])*)"; stop; }\n$/.exec(rule.source);
  const sender = match && normalizeBlockedSender(match[2]);
  if (!sender || sender.type !== match?.[1] || !mailbox) return null;
  const target = mailbox[1].replace(/\\(["\\])/g, "$1");
  return rule.source === blockedSenderSource(sender, target) ? sender : null;
}
export function blockedSenderReplacement(data: LiveMailRules, change: { add: BlockedSender; mailbox: string } | { removeId: string }): MailRuleInput[] {
  if (data.mode !== "rules" && (data.enabled || data.source.trim())) throw new Error("legacy");
  const rules = data.rules.map(({ id, name, kind, source, enabled }) => ({ id, name, kind, source, enabled }));
  if ("removeId" in change) {
    const rule = data.rules.find((item) => item.id === change.removeId);
    if (!rule || !managedBlockedSender(rule)) throw new Error("invalid_request");
    return rules.filter((item) => item.id !== change.removeId);
  }
  if (!change.mailbox || /[\r\n\0]/.test(change.mailbox) || change.mailbox.length > 255) throw new Error("invalid_request");
  if (data.rules.some((rule) => managedBlockedSender(rule)?.value === change.add.value)) throw new Error("duplicate");
  if (rules.length >= 50) throw new Error("limit");
  return [{ id: null, name: NAME, kind: "filter", enabled: true, source: blockedSenderSource(change.add, change.mailbox) }, ...rules];
}
