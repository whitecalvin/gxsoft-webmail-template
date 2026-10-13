import { mailboxIconEntry } from "../mailbox-icon-catalog.mjs";

export type IconTarget = { type: "profile" } | { type: "system"; role: string } | { type: "mailbox" | "sharedAccount"; id: string };
export type IconPreference = { target: IconTarget; icon: string; displayKind?: "folder" | "mailbox" };
export type IconResetScope = { type: "target"; target: IconTarget } | { type: "profile" | "mailboxes" | "sharedAccounts" | "all" };
export type IconPreferences = {
  revision: number; catalogVersion: string; availableTargets: IconTarget[]; preferences: IconPreference[];
  defaultIcon: "default"; defaultDisplayKind: "mailbox";
};
export const ICON_CATALOG_VERSION = "gxmail-20261008-lucide1.41.0-phosphor2.1.10-emoji1.2.1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROLES = new Set(["all", "unread", "starred", "inbox", "drafts", "sent", "archive", "junk", "trash"]);
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
export const validIconRevision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < Number.MAX_SAFE_INTEGER;

export function validIconTarget(value: unknown): value is IconTarget {
  const item = object(value);
  if (!item) return false;
  if (item.type === "profile") return keys(item, ["type"]);
  if (item.type === "system") return keys(item, ["type", "role"]) && typeof item.role === "string" && ROLES.has(item.role);
  return (item.type === "mailbox" || item.type === "sharedAccount") && keys(item, ["type", "id"]) && typeof item.id === "string" && UUID.test(item.id);
}
export function iconTargetKey(target: IconTarget): string {
  return target.type === "profile" ? "profile" : target.type === "system" ? `system:${target.role}` : `${target.type}:${target.id}`;
}
export function validIconPreference(value: unknown): value is IconPreference {
  const item = object(value);
  if (!item || !keys(item, ["target", "icon", "displayKind"]) || !validIconTarget(item.target) || typeof item.icon !== "string" || item.icon.length > 128) return false;
  // Legacy browser aliases must be explicitly converted during migration, not sent to Rust.
  if (item.icon !== "default" && (!/^(lucide|phosphor|emoji):/.test(item.icon) || !mailboxIconEntry(item.icon))) return false;
  return !("displayKind" in item) || (item.target.type === "mailbox" && (item.displayKind === "folder" || item.displayKind === "mailbox"));
}
export function validIconChanges(value: unknown): value is IconPreference[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 64 && value.every(validIconPreference) && new Set(value.map(entry => iconTargetKey(entry.target))).size === value.length;
}
export function validIconReset(value: unknown): value is IconResetScope {
  const item = object(value);
  if (!item) return false;
  return item.type === "target" ? keys(item, ["type", "target"]) && validIconTarget(item.target)
    : keys(item, ["type"]) && ["profile", "mailboxes", "sharedAccounts", "all"].includes(item.type as string);
}
export function iconResetMatches(scope: IconResetScope, target: IconTarget): boolean {
  if (scope.type === "target") return iconTargetKey(scope.target) === iconTargetKey(target);
  return scope.type === "all" || (scope.type === "profile" && target.type === "profile") ||
    (scope.type === "mailboxes" && (target.type === "mailbox" || target.type === "system")) ||
    (scope.type === "sharedAccounts" && target.type === "sharedAccount");
}

/** A malformed/foreign/incompatible snapshot must never become an authoritative SSR default. */
export function projectIconPreferences(value: unknown): IconPreferences | null {
  const root = object(value);
  if (!root || !validIconRevision(root.revision) || root.catalogVersion !== ICON_CATALOG_VERSION || root.defaultIcon !== "default" || root.defaultDisplayKind !== "mailbox" ||
    !Array.isArray(root.availableTargets) || root.availableTargets.length > 16384 || !root.availableTargets.every(validIconTarget) ||
    !Array.isArray(root.preferences) || root.preferences.length > 512 || !root.preferences.every(validIconPreference)) return null;
  const available = new Set(root.availableTargets.map(iconTargetKey));
  const saved = new Set(root.preferences.map(entry => iconTargetKey(entry.target)));
  if (!available.has("profile") || available.size !== root.availableTargets.length || saved.size !== root.preferences.length || [...saved].some(key => !available.has(key))) return null;
  return {
    revision: root.revision, catalogVersion: root.catalogVersion, defaultIcon: root.defaultIcon, defaultDisplayKind: root.defaultDisplayKind,
    availableTargets: root.availableTargets.map(target => ({ ...target })),
    preferences: root.preferences.map(entry => ({ ...entry, target: { ...entry.target } })),
  };
}
