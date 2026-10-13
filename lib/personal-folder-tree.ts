import type { LiveMailbox } from "./tastemail/mail";

export interface PersonalFolderNode {
  path: string;
  label: string;
  mailbox: LiveMailbox | null;
  children: PersonalFolderNode[];
}

/** Server folder paths are slash-delimited. Missing ancestors remain navigation groups. */
export function personalFolderTree(mailboxes: LiveMailbox[]): PersonalFolderNode[] {
  const roots: PersonalFolderNode[] = [];
  const nodes = new Map<string, PersonalFolderNode>();
  for (const mailbox of mailboxes) {
    if (mailbox.role !== null || mailbox.name.toLowerCase() === "inbox") continue;
    const parts = mailbox.name.split("/");
    let siblings = roots;
    for (let index = 0; index < parts.length; index++) {
      const path = parts.slice(0, index + 1).join("/");
      let node = nodes.get(path);
      if (!node) {
        node = { path, label: parts[index], mailbox: null, children: [] };
        nodes.set(path, node); siblings.push(node);
      }
      if (index === parts.length - 1) node.mailbox = mailbox;
      siblings = node.children;
    }
  }
  return roots;
}

export function childFolderName(parent: string, child: string): string | null {
  const leaf = child.trim().normalize("NFC");
  if (!leaf || leaf.includes("/")) return null;
  return parent ? `${parent}/${leaf}` : leaf;
}
