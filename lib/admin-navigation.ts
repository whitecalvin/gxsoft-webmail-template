import { adminResources, type AdminResource } from "./tastemail/admin-management";
export type AdminSection = "dashboard" | "system" | "onboarding" | "gmail-oauth" | AdminResource | "quarantine" | "shared-mailboxes";
export const adminMenuGroups = [
  { id: "operations", items: ["dashboard", "queue", "audit", "reports"] },
  { id: "accounts", items: ["users", "domains", "aliases", "forwarding", "groups", "shared-mailboxes"] },
  { id: "security", items: ["quarantine", "spam-policy", "dkim", "gmail-oauth"] },
  { id: "system", items: ["system", "onboarding", "smtp-relay", "api-keys", "webhooks", "backup-evidence"] },
  { id: "appearance", items: ["branding", "themes", "domain-theme", "theme-packages"] },
  { id: "license", items: ["license"] },
] as const;
export function isAdminSection(value: string): value is AdminSection {
  return value === "dashboard" || value === "system" || value === "onboarding" || value === "gmail-oauth" || value === "quarantine" || value === "shared-mailboxes" || adminResources.includes(value as AdminResource);
}
export function adminSectionHref(section: AdminSection) { return section === "dashboard" ? "/admin" : `/admin/${section}`; }
export function adminSectionFromPath(path: string): AdminSection | null {
  const match = /^\/admin(?:\/([^/]+))?\/?$/.exec(path);
  if (!match) return null;
  const section = match[1] ?? "dashboard";
  return isAdminSection(section) ? section : null;
}
