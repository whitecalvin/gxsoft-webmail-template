import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { requireLinkedAccount, type LinkedAccount } from "../linked-accounts";
import { linkedOAuthRedirect } from "../linked-oauth";

export const LINKED_OAUTH_COOKIE = "__Host-gxwebmail_linked_oauth";
export const LINKED_OAUTH_LOCALE_COOKIE = "__Host-gxwebmail_linked_oauth_locale";
export const LINKED_OAUTH_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: 600 };
export const LINKED_OAUTH_LOCALES = ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"] as const;
export type LinkedOAuthProof = { before: LinkedAccount; state: string; locale: string; issuedAt: number; expiresAt: number };
const purpose = "gxwebmail-linked-oauth-proof-v1";
function key(token: string) {
  if (!token) throw new Error("invalid OAuth proof");
  // 무작위 로그인 세션에서 목적별 키를 파생합니다. 토큰 자체는 쿠키에 넣지 않습니다.
  return createHash("sha256").update(purpose).update("\0").update(token).digest();
}
function aad(origin: string) { return Buffer.from(`${purpose}\0${linkedOAuthRedirect(origin)}`); }
function validate(value: unknown, now: number): LinkedOAuthProof {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid OAuth proof");
  const r = value as Record<string, unknown>, before = requireLinkedAccount(r.before);
  if (Object.keys(r).length !== 5 || before.provider !== "gmail" || typeof r.state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(r.state) || typeof r.locale !== "string" || !LINKED_OAUTH_LOCALES.some(l => l === r.locale) ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(r.issuedAt) || !Number.isSafeInteger(r.expiresAt) || Number(r.issuedAt) > now || Number(r.issuedAt) < 0 || Number(r.expiresAt) !== Number(r.issuedAt) + 600_000 || now >= Number(r.expiresAt)) throw new Error("invalid OAuth proof");
  return { before, state: String(r.state), locale: r.locale, issuedAt: Number(r.issuedAt), expiresAt: Number(r.expiresAt) };
}
export function sealLinkedOAuthProof(token: string, origin: string, before: LinkedAccount, state: string, locale: string, now = Date.now()): string {
  const proof = validate({ before, state, locale, issuedAt: now, expiresAt: now + 600_000 }, now), iv = randomBytes(12), secret = key(token);
  try {
    const cipher = createCipheriv("aes-256-gcm", secret, iv);
    cipher.setAAD(aad(origin));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(proof), "utf8"), cipher.final()]);
    const encoded = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
    if (encoded.length > 3800) throw new Error("invalid OAuth proof");
    return encoded;
  } finally { secret.fill(0); }
}
export function openLinkedOAuthProof(token: string, origin: string, encoded: string, now = Date.now()): LinkedOAuthProof | null {
  if (!/^[A-Za-z0-9_-]{40,3800}$/.test(encoded)) return null;
  let secret: Buffer | undefined;
  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.toString("base64url") !== encoded || bytes.length <= 28) return null;
    secret = key(token);
    const decipher = createDecipheriv("aes-256-gcm", secret, bytes.subarray(0, 12));
    decipher.setAAD(aad(origin)); decipher.setAuthTag(bytes.subarray(12, 28));
    const plaintext = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    try { return validate(JSON.parse(plaintext.toString("utf8")), now); }
    finally { plaintext.fill(0); }
  } catch { return null; }
  finally { secret?.fill(0); }
}
export function linkedOAuthStateMatches(proof: LinkedOAuthProof, state: string): boolean {
  const expected = Buffer.from(proof.state), received = Buffer.from(state);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
