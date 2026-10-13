export const LINKED_PROVIDERS = ["tastemail", "naver", "gmail"] as const;
export type LinkedProvider = typeof LINKED_PROVIDERS[number];
export type LinkedAccount = { id: string; provider: LinkedProvider; email: string; revision: number; credentialGeneration: number;
  status: "pendingAuth" | "pendingVerification" | "reauthRequired" | "connected" | "temporaryError"; capabilities: { read: boolean; send: false; sync: boolean; mutate: false } };
export type LinkedAuthentication = { gmail: boolean; naver: boolean; tastemail: false };
export type LinkedAccounts = { accounts: LinkedAccount[]; limit: number; authenticationAvailable: false | LinkedAuthentication };
export type LinkedFailure = "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | "not_deployed" | "invalid_request" | "not_found" | "conflict" | "limit" | "mutation_uncertain" | "auth_unavailable" | "reauth_required" | "remote_unavailable" | "configuration_required" | "insecure_connection";
export type LinkedSnapshot = { status: "ready"; data: LinkedAccounts } | { status: LinkedFailure; data: null };
export type LinkedCommand = { method: "POST"; input: { provider: LinkedProvider; email: string } } | { method: "DELETE"; id: string; input: { expectedRevision: number } };
const record = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
export const linkedId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function linkedRegistration(value: unknown): LinkedCommand | null {
  const r = record(value);
  if (!r || Object.keys(r).length !== 2 || !LINKED_PROVIDERS.includes(r.provider as LinkedProvider) || typeof r.email !== "string") return null;
  const email = r.email.trim().toLowerCase(), domain = email.split("@")[1];
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email) || new TextEncoder().encode(email).length > 254 || /[\x00-\x1f\x7f]/u.test(email) ||
      r.provider === "naver" && domain !== "naver.com" || r.provider === "gmail" && !["gmail.com", "googlemail.com"].includes(domain)) return null;
  return { method: "POST", input: { provider: r.provider as LinkedProvider, email } };
}
export function linkedDeletion(value: unknown, id: unknown): LinkedCommand | null {
  const r = record(value);
  return linkedId(id) && r && Object.keys(r).length === 1 && Number.isSafeInteger(r.expectedRevision) && Number(r.expectedRevision) >= 1
    ? { method: "DELETE", id, input: { expectedRevision: Number(r.expectedRevision) } } : null;
}
export function requireLinkedAccount(value: unknown): LinkedAccount {
  const r = record(value), c = record(r?.capabilities);
  if (!r || !linkedId(r.id) || !linkedRegistration({ provider: r.provider, email: r.email }) || typeof r.email !== "string" ||
      !Number.isSafeInteger(r.revision) || Number(r.revision) < 1 || !Number.isSafeInteger(r.credentialGeneration) || Number(r.credentialGeneration) < 0 ||
      !["pendingAuth", "pendingVerification", "reauthRequired", "connected", "temporaryError"].includes(String(r.status)) || !c ||
      typeof c.read !== "boolean" || typeof c.sync !== "boolean" || c.send !== false || c.mutate !== false) throw new Error("invalid receipt");
  // 이전 계약의 reauthRequired는 캐시 읽기를 광고하지 않았습니다. 새 계약에서도
  // 인증 전 읽기나 연결되지 않은 동기화, 원격 발송/변경은 허용하지 않습니다.
  const readable = ["connected", "temporaryError", "reauthRequired"].includes(String(r.status));
  if (c.read && !readable || c.sync !== (r.status === "connected") ||
      ["connected", "temporaryError"].includes(String(r.status)) && !c.read) throw new Error("invalid receipt");
  // 허용한 필드만 반환하여 비밀/내부 응답이 브라우저에 전달되지 않게 합니다.
  return { id: r.id, provider: r.provider as LinkedProvider, email: r.email, revision: Number(r.revision), credentialGeneration: Number(r.credentialGeneration),
    status: r.status as LinkedAccount["status"], capabilities: { read: c.read, send: false, sync: c.sync, mutate: false } };
}
export function requireLinkedAccounts(value: unknown): LinkedAccounts {
  const r = record(value);
  const auth = record(r?.authenticationAvailable);
  if (!r || !Array.isArray(r.accounts) || r.limit !== 10 || r.accounts.length > 10 ||
      r.authenticationAvailable !== false && (!auth || typeof auth.gmail !== "boolean" || typeof auth.naver !== "boolean" || auth.tastemail !== false)) throw new Error("invalid receipt");
  const accounts = r.accounts.map(requireLinkedAccount);
  if (accounts.some(a => auth ? a.capabilities.read !== ["connected", "temporaryError", "reauthRequired"].includes(a.status)
    : a.capabilities.read || a.capabilities.sync || ["connected", "temporaryError"].includes(a.status))) throw new Error("invalid receipt");
  if (new Set(accounts.map(a => a.id)).size !== accounts.length || new Set(accounts.map(a => `${a.provider}:${a.email.toLowerCase()}`)).size !== accounts.length) throw new Error("duplicate receipt");
  return { accounts, limit: 10, authenticationAvailable: auth ? { gmail: auth.gmail as boolean, naver: auth.naver as boolean, tastemail: false } : false };
}
