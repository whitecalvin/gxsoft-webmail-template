import "server-only";

export const MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";

export function validLiveJmapSession(value: unknown): value is {
  username: string;
  apiUrl: "/jmap/api";
  primaryAccounts: Record<string, string>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  if (session.apiUrl !== "/jmap/api" || typeof session.username !== "string" || !session.username.trim()) return false;
  const primaryAccounts = session.primaryAccounts;
  if (!primaryAccounts || typeof primaryAccounts !== "object" || Array.isArray(primaryAccounts)) return false;
  const accountId = (primaryAccounts as Record<string, unknown>)[MAIL_CAPABILITY];
  if (typeof accountId !== "string" || !accountId) return false;
  const accounts = session.accounts;
  return !!accounts && typeof accounts === "object" && !Array.isArray(accounts) &&
    !!(accounts as Record<string, unknown>)[accountId] &&
    typeof (accounts as Record<string, unknown>)[accountId] === "object" &&
    !Array.isArray((accounts as Record<string, unknown>)[accountId]);
}
