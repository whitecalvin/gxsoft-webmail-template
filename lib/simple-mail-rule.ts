export type SimpleMailRule = { sender: string; subject: string; action: "keep" | "read" | "star" | "move"; stop: boolean; mailbox?: string };
export const EMPTY_SIMPLE_RULE: SimpleMailRule = { sender: "", subject: "", action: "keep", stop: false };
const PREFIX = "# gxwebmail-filter-v1 ";
const MOVE_PREFIX = "# gxwebmail-filter-v2 ";
const quote = (text: string) => `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
function valid(value: unknown): value is SimpleMailRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rule = value as Record<string, unknown>;
  return Object.keys(rule).every(key => ["sender", "subject", "action", "stop", "mailbox"].includes(key)) && typeof rule.sender === "string" && typeof rule.subject === "string" &&
    rule.sender.length <= 254 && rule.subject.length <= 998 && !/[\x00-\x1f\x7f]/.test(rule.sender + rule.subject) &&
    ["keep", "read", "star", "move"].includes(String(rule.action)) && typeof rule.stop === "boolean" &&
    (rule.action === "move" ? typeof rule.mailbox === "string" && rule.mailbox.trim().length > 0 && rule.mailbox.length <= 255 && !/[\x00-\x1f\x7f]/.test(rule.mailbox) : rule.mailbox === undefined);
}
export function simpleMailRuleSource(rule: SimpleMailRule): string {
  if (!valid(rule)) throw new Error("invalid_request");
  const normalized = { sender: rule.sender, subject: rule.subject, action: rule.action, stop: rule.stop, ...(rule.action === "move" ? { mailbox: rule.mailbox } : {}) };
  const conditions = [rule.sender ? `address :is "from" ${quote(rule.sender)}` : "", rule.subject ? `header :contains "subject" ${quote(rule.subject)}` : ""].filter(Boolean);
  const action = rule.action === "move" ? `fileinto ${quote(rule.mailbox!)};` : rule.action === "read" ? 'addflag "\\\\Seen";\nkeep;' : rule.action === "star" ? 'addflag "\\\\Flagged";\nkeep;' : "keep;";
  const body = `${action}${rule.stop ? "\nstop;" : ""}`;
  return `${rule.action === "move" ? MOVE_PREFIX : PREFIX}${JSON.stringify(normalized)}\n${rule.action === "move" ? 'require "fileinto";\n' : rule.action !== "keep" ? 'require "imap4flags";\n' : ""}${conditions.length ? `if ${conditions.length === 1 ? conditions[0] : `allof (${conditions.join(", ")})`} {\n${body.split("\n").map(line => `  ${line}`).join("\n")}\n}` : body}\n`;
}
// Only exact, lossless templates may enter the visual editor. Unknown Sieve is never rewritten.
export function parseSimpleMailRule(source: string): SimpleMailRule | null {
  if (source === "keep;") return { ...EMPTY_SIMPLE_RULE };
  const prefix = source.startsWith(MOVE_PREFIX) ? MOVE_PREFIX : PREFIX;
  if (source.startsWith(prefix)) {
    try {
      const parsed: unknown = JSON.parse(source.slice(prefix.length, source.indexOf("\n")));
      return valid(parsed) && simpleMailRuleSource(parsed) === source ? parsed : null;
    } catch { return null; }
  }
  const seed = /^if address :is "from" "((?:[^"\\\r\n]|\\["\\])+)" \{\n  keep;\n\}\n$/.exec(source);
  if (!seed) return null;
  const rule = { ...EMPTY_SIMPLE_RULE, sender: seed[1].replace(/\\(["\\])/g, "$1") };
  return valid(rule) ? rule : null;
}

export function simpleRuleMoveReady(source: string, mailboxNames: readonly string[]): boolean {
  const rule = parseSimpleMailRule(source);
  return rule?.action !== "move" || mailboxNames.includes(rule.mailbox!);
}
