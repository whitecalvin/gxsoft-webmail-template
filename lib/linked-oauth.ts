import { linkedId, requireLinkedAccount, type LinkedAccount, type LinkedAccounts } from "./linked-accounts";

export const LINKED_GOOGLE_CALLBACK_PATH = "/api/mail/linked-accounts/oauth/callback";
export type LinkedOAuthRevision = { expectedRevision: number };
export type LinkedOAuthCallback = { state: string; code: string };
export type LinkedOAuthStart = { authorizationUrl: string; expiresIn: 600; state: string };
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const bounded = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && new TextEncoder().encode(v).length <= max && !/\p{Cc}/u.test(v);

export function linkedOAuthRevision(id: unknown, value: unknown): LinkedOAuthRevision | null {
  const r = object(value);
  return linkedId(id) && r && Object.keys(r).length === 1 && Number.isSafeInteger(r.expectedRevision) && Number(r.expectedRevision) >= 1 && Number(r.expectedRevision) < Number.MAX_SAFE_INTEGER
    ? { expectedRevision: Number(r.expectedRevision) } : null;
}
export function linkedOAuthCallback(value: unknown): LinkedOAuthCallback | null {
  const r = object(value);
  return r && Object.keys(r).length === 2 && bounded(r.state, 256) && bounded(r.code, 4096) ? { state: r.state, code: r.code } : null;
}
export function linkedOAuthBefore(data: LinkedAccounts, id: string, input: LinkedOAuthRevision): LinkedAccount {
  const account = data.accounts.find(a => a.id === id);
  if (!linkedOAuthRevision(id, input) || !data.authenticationAvailable || !data.authenticationAvailable.gmail || !account || account.provider !== "gmail" || account.revision !== input.expectedRevision || account.credentialGeneration >= Number.MAX_SAFE_INTEGER) throw new Error("invalid OAuth scope");
  return account;
}
export function linkedOAuthRedirect(origin: string): string {
  const url = new URL(origin);
  // HTTPS 콜백이 완성되기 전에는 Google 인증을 시작하지 않습니다.
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("invalid OAuth origin");
  return `${url.origin}${LINKED_GOOGLE_CALLBACK_PATH}`;
}
export function linkedOAuthStartReceipt(value: unknown, before: LinkedAccount, callback: string): LinkedOAuthStart {
  const r = object(value);
  if (!r || r.expiresIn !== 600 || !bounded(r.authorizationUrl, 8192)) throw new Error("invalid OAuth receipt");
  const url = new URL(r.authorizationUrl), entries = [...url.searchParams], params = url.searchParams;
  const keys = ["client_id", "redirect_uri", "response_type", "scope", "state", "access_type", "prompt", "login_hint", "code_challenge", "code_challenge_method"];
  if (before.provider !== "gmail" || url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password || url.hash || entries.length !== keys.length || keys.some(k => params.getAll(k).length !== 1) || entries.some(([k]) => !keys.includes(k)) ||
      !bounded(params.get("client_id"), 1024) || params.get("redirect_uri") !== callback || params.get("response_type") !== "code" || params.get("scope") !== "https://mail.google.com/" || params.get("access_type") !== "offline" || params.get("prompt") !== "consent" || params.get("login_hint") !== before.email || params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge") ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(params.get("state") ?? "")) throw new Error("invalid OAuth receipt");
  const redirect = new URL(callback);
  if (linkedOAuthRedirect(redirect.origin) !== callback) throw new Error("invalid OAuth callback");
  // 서버 응답의 임의 필드나 토큰은 전달하지 않습니다. state는 서버 쿠키용입니다.
  return { authorizationUrl: url.href, expiresIn: 600, state: params.get("state")! };
}
export function linkedOAuthCompletionReceipt(value: unknown, before: LinkedAccount): LinkedAccount {
  const account = requireLinkedAccount(value);
  if (before.provider !== "gmail" || account.provider !== before.provider || account.id !== before.id || account.email !== before.email || account.revision !== before.revision + 1 || account.credentialGeneration !== before.credentialGeneration + 1 || account.status !== "connected") throw new Error("invalid OAuth receipt");
  return account;
}
