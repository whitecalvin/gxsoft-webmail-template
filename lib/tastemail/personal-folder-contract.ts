import type { LiveMailbox } from "./mail";

export type PersonalFolderChange =
  | { operation: "create"; name: string }
  | { operation: "rename"; mailboxId: string; name: string }
  | { operation: "delete"; mailboxId: string };

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function name(value: unknown): string | null {
  if (typeof value !== "string" || new TextEncoder().encode(value).length > 255 || /^[\uFEFF]/u.test(value)
      || /[\p{Cc}\p{Cn}\u2028\u2029]/u.test(value)) return null;
  const normalized = value.trim().replace(/\/$/u, "").normalize("NFC");
  return normalized && normalized.split("/").every(Boolean) && new TextEncoder().encode(normalized).length <= 255 ? normalized : null;
}

/** Never accept account IDs, owners or special-use roles from the browser. */
export function personalFolderInput(value: unknown): PersonalFolderChange | null {
  const input = record(value);
  if (!input || Object.keys(input).some(key => !["operation", "mailboxId", "name"].includes(key))) return null;
  const folderName = name(input.name);
  if (input.operation === "create") {
    return input.mailboxId === undefined && folderName ? { operation: "create", name: folderName } : null;
  }
  if (typeof input.mailboxId !== "string" || !UUID.test(input.mailboxId)) return null;
  const mailboxId = input.mailboxId.toLowerCase();
  if (input.operation === "rename" && folderName) return { operation: "rename", mailboxId, name: folderName };
  if (input.operation === "delete" && input.name === undefined) return { operation: "delete", mailboxId };
  return null;
}

const natural = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Verify the changed target before exposing a projected, token-free snapshot. */
export function personalFolderReceipt(value: unknown, input: PersonalFolderChange, before: LiveMailbox[]): LiveMailbox[] {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.mailboxes) || raw.mailboxes.length > 10_000) throw new Error("invalid folder receipt");
  const ids = new Set<string>();
  const mailboxes = raw.mailboxes.map((item: unknown): LiveMailbox => {
    const folder = record(item);
    if (!folder || typeof folder.id !== "string" || !UUID.test(folder.id) || ids.has(folder.id.toLowerCase())
        || typeof folder.name !== "string" || !folder.name || folder.name.length > 1024
        || (folder.role !== null && typeof folder.role !== "string")
        || !natural(folder.totalEmails) || !natural(folder.unreadEmails) || folder.unreadEmails > folder.totalEmails
        || !natural(folder.usedBytes) || !natural(folder.quotaBytes)) throw new Error("invalid folder receipt");
    const id = folder.id.toLowerCase(); ids.add(id);
    return { id, name: folder.name, role: folder.role, totalEmails: folder.totalEmails,
      unreadEmails: folder.unreadEmails, usedBytes: folder.usedBytes, quotaBytes: folder.quotaBytes };
  });
  // Unrelated folders must not disappear in the acknowledgement of one operation.
  if (before.some(folder => !(input.operation === "delete" && folder.id === input.mailboxId) && !ids.has(folder.id))) throw new Error("incomplete folder receipt");
  if (input.operation === "create") {
    const created = mailboxes.filter(folder => folder.name === input.name && folder.role === null && !before.some(old => old.id === folder.id));
    if (created.length !== 1) throw new Error("unconfirmed folder creation");
  } else if (input.operation === "rename") {
    if (!mailboxes.some(folder => folder.id === input.mailboxId && folder.role === null && folder.name === input.name)) throw new Error("unconfirmed folder rename");
    const source = before.find(folder => folder.id === input.mailboxId);
    if (!source) throw new Error("missing rename source");
    // 서버의 원자적 하위 경로 변경까지 확인한 뒤 트리를 갱신합니다.
    for (const child of before.filter(folder => folder.name.startsWith(`${source.name}/`))) {
      const expected = `${input.name}${child.name.slice(source.name.length)}`;
      if (!mailboxes.some(folder => folder.id === child.id && folder.name === expected && folder.role === child.role)) throw new Error("unconfirmed descendant rename");
    }
  } else if (ids.has(input.mailboxId)) throw new Error("unconfirmed folder deletion");
  return mailboxes;
}
