type SearchMailbox = { id: string; name: string; role: string | null };
type SearchFilter = Record<string, unknown>;
const FILTER_OPERATORS = new Set(["from", "to", "cc", "bcc", "subject", "body", "is", "filename", "has", "in", "before", "after", "larger", "smaller"]);
const MAILBOX_ROLE_ALIASES: Record<string, string> = {
  inbox: "inbox", "받은편지함": "inbox",
  sent: "sent", "보낸편지함": "sent",
  drafts: "drafts", draft: "drafts", "임시보관함": "drafts",
  archive: "archive", "보관함": "archive",
  junk: "junk", spam: "junk", "스팸": "junk",
  trash: "trash", "휴지통": "trash",
};

export function searchDisplayMailbox(mailboxes: SearchMailbox[], mailboxIds: Record<string, unknown> | null, selectedMailbox: SearchMailbox | null | undefined): SearchMailbox | null {
  return selectedMailbox ?? mailboxes.find((mailbox) => mailboxIds?.[mailbox.id] === true) ?? null;
}

export function searchFilterMailboxId(filter: SearchFilter | null): string | null {
  if (!filter) return null;
  if (typeof filter.inMailbox === "string") return filter.inMailbox;
  if (filter.operator !== "AND" || !Array.isArray(filter.conditions)) return null;
  for (const condition of filter.conditions) {
    if (condition && typeof condition === "object" && !Array.isArray(condition) &&
      "inMailbox" in condition && typeof condition.inMailbox === "string") return condition.inMailbox;
  }
  return null;
}

export class InvalidSearchFilterError extends Error {
  constructor() { super("invalid_search_filter"); }
}

function searchTimestamp(value: string): string {
  const date = value.slice(0, 10);
  const calendarDate = `${date}T00:00:00Z`;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || Number.isNaN(Date.parse(calendarDate)) || new Date(calendarDate).toISOString().slice(0, 10) !== date) {
    throw new InvalidSearchFilterError();
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return calendarDate;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw new InvalidSearchFilterError();
  }
  return value;
}

function searchSize(value: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/iu.exec(value);
  if (!match) throw new InvalidSearchFilterError();
  const factors: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  const bytes = Number(match[1]) * factors[(match[2] ?? "b").toLowerCase()];
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes >= Number.MAX_SAFE_INTEGER) {
    throw new InvalidSearchFilterError();
  }
  return bytes;
}

export function liveSearchFilter(query: string, mailboxes: SearchMailbox[]): SearchFilter | null {
  if (!query.trim()) return {};
  const conditions: SearchFilter[] = [];
  let hasOperator = false;
  const tokens = query.match(/(?:[^\s"]+):"[^"]+"|"[^"]+"|\S+/gu) ?? [];
  for (const token of tokens) {
    const separator = token.indexOf(":");
    const operator = separator > 0 ? token.slice(0, separator).toLowerCase() : "";
    const rawValue = separator > 0 ? token.slice(separator + 1) : token;
    const value = rawValue.replace(/^"|"$/gu, "").trim();
    if (!value) {
      if (FILTER_OPERATORS.has(operator)) throw new InvalidSearchFilterError();
      continue;
    }
    if (["from", "to", "cc", "bcc", "subject", "body"].includes(operator)) {
      hasOperator = true;
      conditions.push({ [operator]: value });
    } else if (operator === "is") {
      hasOperator = true;
      const state = value.toLowerCase();
      if (state === "unread") conditions.push({ notKeyword: "$seen" });
      else if (state === "read") conditions.push({ hasKeyword: "$seen" });
      else if (state === "starred") conditions.push({ hasKeyword: "$flagged" });
      else throw new InvalidSearchFilterError();
    } else if (operator === "filename") {
      hasOperator = true;
      conditions.push({ attachmentName: value });
    } else if (operator === "larger" || operator === "smaller") {
      const bytes = searchSize(value);
      if (operator === "smaller" && bytes === 0) throw new InvalidSearchFilterError();
      hasOperator = true;
      conditions.push(operator === "larger" ? { minSize: bytes + 1 } : { maxSize: bytes - 1 });
    } else if (operator === "before" || operator === "after") {
      hasOperator = true;
      conditions.push({ [operator]: searchTimestamp(value) });
    } else if (operator === "has") {
      if (value.toLowerCase() !== "attachment") throw new InvalidSearchFilterError();
      hasOperator = true;
      conditions.push({ hasAttachment: true });
    } else if (operator === "in") {
      hasOperator = true;
      const name = value.toLocaleLowerCase();
      const role = MAILBOX_ROLE_ALIASES[name] ?? name;
      const mailbox = mailboxes.find((item) => item.role === role || item.name.toLocaleLowerCase() === name);
      if (!mailbox) return null;
      conditions.push({ inMailbox: mailbox.id });
    } else {
      conditions.push({ text: token.replace(/^"|"$/gu, "") });
    }
  }
  if (!hasOperator) return { text: tokens.map((token) => token.replace(/^"|"$/gu, "")).join(" ") };
  // Rust permits 64 filter nodes. Reserve eight for the outer AND and the
  // optional date, folder, attachment, and filename filters.
  if (conditions.length > 56) throw new InvalidSearchFilterError();
  if (conditions.length === 0) return { text: query };
  return conditions.length === 1 ? conditions[0] : { operator: "AND", conditions };
}
