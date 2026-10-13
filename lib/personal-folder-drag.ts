import type { LiveMailbox } from "./tastemail/mail";
import { personalFolderInput } from "./tastemail/personal-folder-contract";

export type FolderKinds = Record<string, "folder" | "mailbox">;
/** Personal mailboxes and folders can contain items. Missing ancestors are virtual folders. */
export function folderDropChange(mailboxes: LiveMailbox[], _kinds: FolderKinds, sourceId: string, targetPath: string) {
  const personal = mailboxes.filter(m => m.role === null && m.name.toLowerCase() !== "inbox");
  const source = personal.find(m => m.id === sourceId);
  if (!source || targetPath === source.name || targetPath.startsWith(`${source.name}/`)) return null;
  if (targetPath) {
    if (mailboxes.some(m => (m.role !== null || m.name.toLowerCase() === "inbox") && (m.name === targetPath || targetPath.startsWith(`${m.name}/`)))) return null;
    const target = personal.find(m => m.name === targetPath);
    if (!target && !personal.some(m => m.name.startsWith(`${targetPath}/`))) return null;
  }
  const leaf = source.name.split("/").at(-1)!;
  const name = targetPath ? `${targetPath}/${leaf}` : leaf;
  if (name === source.name || name.toLowerCase() === "inbox") return null;
  const affected = personal.filter(m => m.id === source.id || m.name.startsWith(`${source.name}/`));
  const ids = new Set(affected.map(m => m.id));
  for (const item of affected) {
    const nextName = `${name}${item.name.slice(source.name.length)}`;
    if (mailboxes.some(m => !ids.has(m.id) && m.name === nextName)) return null;
    if (!personalFolderInput({ operation: "rename", mailboxId: item.id, name: nextName })) return null;
  }
  return personalFolderInput({ operation: "rename", mailboxId: source.id, name });
}
