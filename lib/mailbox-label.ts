const SYSTEM_ROLES = ["inbox", "drafts", "sent", "archive", "spam", "trash"] as const;
type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Localize system roles, while preserving user-defined folder names. */
export function mailboxLabel(role: string | null, name: string, translate: (role: SystemRole) => string): string {
  const normalizedRole = role === "junk" ? "spam" : role;
  const systemRole = SYSTEM_ROLES.find((value) => value === normalizedRole);
  return systemRole ? translate(systemRole) : name;
}
