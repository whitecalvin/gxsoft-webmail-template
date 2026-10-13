import { linkedId, requireLinkedAccount, type LinkedAccount, type LinkedAccounts } from "./linked-accounts";

export type LinkedAuthKind = "credentials" | "verify";
export type LinkedAuthCommand = { kind: "credentials"; id: string; input: { expectedRevision: number; provider: "naver"; appPassword: string } }
  | { kind: "verify"; id: string; input: { expectedRevision: number } };
export type LinkedAuthPending = { kind: LinkedAuthKind | "oauthStart" | "folders" | "sync" | "queue"; before: LinkedAccount };
export const LINKED_AUTH_FAILURES = ["auth_unavailable", "reauth_required", "remote_unavailable", "configuration_required", "insecure_connection"] as const;

export function linkedAuthenticationCommand(kind: unknown, id: unknown, value: unknown): LinkedAuthCommand | null {
  if (!linkedId(id) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (!Number.isSafeInteger(r.expectedRevision) || Number(r.expectedRevision) < 1) return null;
  if (kind === "verify" && Object.keys(r).length === 1) return { kind, id, input: { expectedRevision: Number(r.expectedRevision) } };
  if (kind !== "credentials" || Object.keys(r).length !== 3 || r.provider !== "naver" || typeof r.appPassword !== "string" ||
      !r.appPassword || new TextEncoder().encode(r.appPassword).length > 1024 || /\p{Cc}/u.test(r.appPassword) || Number(r.expectedRevision) === Number.MAX_SAFE_INTEGER) return null;
  return { kind, id, input: { expectedRevision: Number(r.expectedRevision), provider: "naver", appPassword: r.appPassword } };
}

export function linkedAuthBefore(data: LinkedAccounts, command: LinkedAuthCommand): LinkedAccount {
  const a = data.accounts.find(a => a.id === command.id);
  if (!a || a.provider !== "naver" || data.authenticationAvailable === false || !data.authenticationAvailable.naver || a.revision !== command.input.expectedRevision ||
      command.kind === "verify" && (a.status === "pendingAuth" || a.status === "connected" || a.credentialGeneration === 0)) throw new Error("auth_unavailable");
  return a;
}

export function linkedAuthReceipt(value: unknown, before: LinkedAccount, kind: LinkedAuthKind): LinkedAccount {
  const a = requireLinkedAccount(value), increment = kind === "credentials" ? 1 : 0;
  if (a.id !== before.id || a.provider !== before.provider || a.email !== before.email || a.revision !== before.revision + increment ||
      a.credentialGeneration !== before.credentialGeneration + increment || a.status !== (kind === "credentials" ? "pendingVerification" : "connected")) throw new Error("invalid receipt");
  return a;
}

export function linkedAuthResolved(data: LinkedAccounts, pending: LinkedAuthPending): boolean {
  // LIST 자체의 완료 영수증이 없으므로 계정 목록만으로 불확실한 조회를 해제할 수 없습니다.
  if (pending.kind === "folders" || pending.kind === "sync" || pending.kind === "queue") return false;
  const a = data.accounts.find(a => a.id === pending.before.id), b = pending.before;
  if (!a || a.provider !== b.provider || a.email !== b.email) return false;
  if (pending.kind === "oauthStart") return a.provider === "gmail" && a.revision === b.revision + 1 && a.credentialGeneration === b.credentialGeneration + 1 && a.status === "connected";
  // 비밀번호 자체를 비교할 수 없으므로 변경된 세대만 재확인합니다. 저장 성공
  // 알림이나 인증 자동 실행은 하지 않습니다. 같은 상태는 완료 증거가 아닙니다.
  return pending.kind === "credentials" ? a.revision === b.revision + 1 && a.credentialGeneration === b.credentialGeneration + 1
    : a.revision === b.revision && a.credentialGeneration === b.credentialGeneration && a.status !== b.status && ["connected", "temporaryError", "reauthRequired"].includes(a.status);
}
