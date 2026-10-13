import { mailboxIconEntry } from "./mailbox-icon-catalog.mjs";
import { iconPreferenceKey } from "./mailbox-icon-snapshot";
import { iconTargetKey, projectIconPreferences, type IconPreference, type IconPreferences } from "./tastemail/icon-preferences-contract";

export type IconImportPlan = { changes: IconPreference[]; remaining: number; skipped: number; blocked: "invalid_snapshot" | "capacity" | null };

/** Prepare one explicitly confirmed batch only. Never upload, scan another account or overwrite server choices. */
export function planIconPreferenceImport(accountAddress: string, snapshot: IconPreferences, local: Record<string, unknown>): IconImportPlan {
  const account = accountAddress.trim().toLowerCase();
  const server = projectIconPreferences(snapshot);
  if (!account || account.length > 320 || /[\u0000-\u001f\u007f]/u.test(account) || !server || !local || typeof local !== "object" || Array.isArray(local)) {
    return { changes: [], remaining: 0, skipped: 0, blocked: "invalid_snapshot" };
  }
  const saved = new Set(server.preferences.map(entry => iconTargetKey(entry.target)));
  const candidates: IconPreference[] = [];
  let skipped = 0;
  for (const target of [...server.availableTargets].sort((left, right) => {
    const a = iconTargetKey(left), b = iconTargetKey(right);
    return a < b ? -1 : a > b ? 1 : 0;
  })) {
    if (saved.has(iconTargetKey(target))) continue;
    const key = iconPreferenceKey(account, target);
    const raw = Object.hasOwn(local, key) ? local[key] : undefined;
    const kindKey = target.type === "mailbox" ? `gxmail:folder-kind:v1:${encodeURIComponent(account)}:${encodeURIComponent(target.id)}` : "";
    const kind = kindKey && Object.hasOwn(local, kindKey) ? local[kindKey] : undefined;
    if (kind !== undefined && kind !== "folder" && kind !== "mailbox") { skipped++; continue; }
    let icon = "default";
    if (raw !== undefined && raw !== null && raw !== "default") {
      const entry = typeof raw === "string" ? mailboxIconEntry(raw) : null;
      if (!entry) { skipped++; continue; }
      // Rust accepts canonical installed IDs, not the old browser aliases such as shopping or heart.
      icon = `${entry.packageId}:${entry.name}`;
    }
    if (icon === "default" && (kind === undefined || kind === server.defaultDisplayKind)) continue;
    candidates.push({ target: { ...target }, icon, ...(kind ? { displayKind: kind as "folder" | "mailbox" } : {}) });
  }
  const room = Math.max(0, 512 - server.preferences.length);
  const changes = candidates.slice(0, Math.min(64, room));
  return { changes, remaining: candidates.length - changes.length, skipped, blocked: candidates.length && !room ? "capacity" : null };
}
