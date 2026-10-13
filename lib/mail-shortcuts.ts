export const SHORTCUT_ACTIONS = ["compose", "search", "inbox", "archive", "delete", "reply", "forward"] as const;
export type ShortcutAction = typeof SHORTCUT_ACTIONS[number];
export function normalizeShortcut(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
  return /^[A-Z0-9/#]( [A-Z0-9/#])?$/.test(normalized) ? normalized : null;
}
export function shortcutConflicts(bindings: Record<string, string>): boolean {
  const values = SHORTCUT_ACTIONS.map((action) => normalizeShortcut(bindings[action]));
  return values.some((value, index) => !value || values.some((other, otherIndex) => otherIndex !== index && other && (other === value || other.startsWith(`${value} `) || value.startsWith(`${other} `))));
}
export class ShortcutSequence {
  private prefix = "";
  private expires = 0;
  reset() { this.prefix = ""; this.expires = 0; }
  match(key: string, bindings: Record<string, string>, now: number): ShortcutAction | null {
    if (shortcutConflicts(bindings)) { this.reset(); return null; }
    const token = key.toUpperCase();
    const candidate = this.prefix && now < this.expires ? `${this.prefix} ${token}` : token;
    this.reset();
    const exact = SHORTCUT_ACTIONS.find((action) => bindings[action] === candidate);
    if (exact) return exact;
    if (SHORTCUT_ACTIONS.some((action) => bindings[action].startsWith(`${token} `))) { this.prefix = token; this.expires = now + 1000; }
    return null;
  }
}
