/** TASTEMAIL linked_accounts/settings.rs의 공개 계약. 비밀키는 응답에서 투영하지 않는다. */
export type GmailOAuthSettings = { source: "database" | "environment"; revision: number; enabled: boolean; clientId: string; redirectUri: string; secretConfigured: boolean; encryptionAvailable: boolean; available: boolean };
export type GmailOAuthUpdate = { expectedRevision: number; enabled: boolean; clientId: string; publicOrigin: string; clientSecret?: string };
export type GmailOAuthCheck = { configurationValid: boolean; encryptionAvailable: boolean; available: boolean; googleAuthorizationVerified: false };
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid_response"); return value as Record<string, unknown>; }
function revision(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= Number.MAX_SAFE_INTEGER) throw Error("invalid_response"); return value as number; }
function text(value: unknown, max: number): string { if (typeof value !== "string" || new TextEncoder().encode(value).length > max || /\p{Cc}/u.test(value)) throw Error("invalid_response"); return value; }
function flag(value: unknown): boolean { if (typeof value !== "boolean") throw Error("invalid_response"); return value; }
export function gmailOAuthCallback(origin: string): string {
  const url = new URL(origin);
  if (new TextEncoder().encode(origin).length > 1800 || url.protocol !== "https:" || !url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error("invalid_https_origin");
  return `${url.origin}/api/mail/linked-accounts/oauth/callback`;
}
export function gmailOAuthSettings(value: unknown): GmailOAuthSettings {
  const r = record(value);
  if (r.source !== "database" && r.source !== "environment") throw Error("invalid_response");
  const redirectUri = text(r.redirectUri, 2048);
  // 기존 환경 변수는 다른 HTTPS callback을 가질 수 있다. 숨기지 않고 표시하여 수정하게 한다.
  if (redirectUri) { const url = new URL(redirectUri); if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error("invalid_response"); }
  const result = { source: r.source, revision: revision(r.revision), enabled: flag(r.enabled), clientId: text(r.clientId, 1024), redirectUri, secretConfigured: flag(r.secretConfigured), encryptionAvailable: flag(r.encryptionAvailable), available: flag(r.available) };
  if (result.available && (!result.enabled || !result.secretConfigured || !result.encryptionAvailable || !result.clientId || !redirectUri)) throw Error("invalid_response");
  return result as GmailOAuthSettings;
}
export function gmailOAuthUpdate(value: unknown): GmailOAuthUpdate {
  const r = record(value);
  if (Object.keys(r).some(k => !["expectedRevision", "enabled", "clientId", "publicOrigin", "clientSecret"].includes(k))) throw Error("invalid_configuration");
  const clientId = text(r.clientId, 1024), publicOrigin = text(r.publicOrigin, 1800);
  if (!clientId) throw Error("invalid_configuration");
  gmailOAuthCallback(publicOrigin);
  const result: GmailOAuthUpdate = { expectedRevision: revision(r.expectedRevision), enabled: flag(r.enabled), clientId, publicOrigin: new URL(publicOrigin).origin };
  // 빈 비밀키를 생략하면 서버가 환경 설정 또는 비활성 DB 설정의 기존 키를 유지한다.
  if (r.clientSecret !== undefined) { const secret = text(r.clientSecret, 1024); if (secret) result.clientSecret = secret; }
  return result;
}
export function gmailOAuthCheck(value: unknown): GmailOAuthCheck {
  const r = record(value);
  if (r.googleAuthorizationVerified !== false) throw Error("invalid_response");
  const result = { configurationValid: flag(r.configurationValid), encryptionAvailable: flag(r.encryptionAvailable), available: flag(r.available), googleAuthorizationVerified: false as const };
  if (result.available !== (result.configurationValid && result.encryptionAvailable)) throw Error("invalid_response");
  return result;
}
export function gmailOAuthSaved(value: unknown, expected: number): number { const r = record(value); if (r.saved !== true || revision(r.revision) !== expected + 1) throw Error("mutationUncertain"); return r.revision as number; }
export const gmailOAuthErrors = ["unauthorized", "forbidden", "unsupported", "invalid_https_origin", "invalid_configuration", "secret_required", "encryption_unavailable", "settings_unavailable", "revision_conflict", "rateLimited", "unavailable", "mutationUncertain", "insecure_connection"] as const;
export function gmailOAuthError(value: unknown): string { return typeof value === "string" && gmailOAuthErrors.some(e => e === value) ? value : "unavailable"; }
