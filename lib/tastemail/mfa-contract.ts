export type TotpEnrollment = { enrollmentId: string; secret: string; expiresAt: string };
export type TotpActivation = { recoveryCodes: string[]; sessionsRevoked: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function mfaInput(value: unknown) {
  const input = object(value);
  if (!input) return null;
  if (input.operation === "begin" && Object.keys(input).length === 2 && typeof input.currentPassword === "string" &&
    input.currentPassword.length > 0 && new TextEncoder().encode(input.currentPassword).length <= 1024) {
    return { operation: "begin" as const, currentPassword: input.currentPassword };
  }
  if (input.operation === "activate" && Object.keys(input).length === 3 && typeof input.enrollmentId === "string" &&
    UUID.test(input.enrollmentId) && typeof input.code === "string" && /^\d{6}$/.test(input.code.trim())) {
    return { operation: "activate" as const, enrollmentId: input.enrollmentId, code: input.code.trim() };
  }
  return null;
}
export function enrollmentReceipt(value: unknown, now = Date.now()): TotpEnrollment {
  const result = object(value);
  if (!result || typeof result.enrollmentId !== "string" || !UUID.test(result.enrollmentId) ||
    typeof result.secret !== "string" || !/^[A-Z2-7]{16,128}$/.test(result.secret) ||
    typeof result.expiresAt !== "string" || !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= now) {
    throw new Error("unavailable");
  }
  return { enrollmentId: result.enrollmentId, secret: result.secret, expiresAt: result.expiresAt };
}
export function activationReceipt(value: unknown): TotpActivation {
  const result = object(value);
  if (!result || !Array.isArray(result.recoveryCodes) || result.recoveryCodes.length === 0 || result.recoveryCodes.length > 100 ||
    result.recoveryCodes.some((code) => typeof code !== "string" || !/^[A-Za-z0-9-]{8,128}$/.test(code)) ||
    new Set(result.recoveryCodes).size !== result.recoveryCodes.length || !Number.isSafeInteger(result.sessionsRevoked) || Number(result.sessionsRevoked) < 0) {
    throw new Error("unavailable");
  }
  return { recoveryCodes: result.recoveryCodes as string[], sessionsRevoked: Number(result.sessionsRevoked) };
}
