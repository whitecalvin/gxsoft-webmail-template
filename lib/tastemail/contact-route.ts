import "server-only";

import { NextResponse } from "next/server";
import { ContactServiceError, type ContactInput } from "./contacts";
import { MailServiceError } from "./mail";

export function contactJson(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    const requested = new URL(origin);
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
    return requested.host === host && requested.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export async function contactInput(request: Request): Promise<ContactInput | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const input = value as Record<string, unknown>;
    if (typeof input.email !== "string" || !input.email.trim() || input.email.length > 320 ||
        (input.displayName !== null && typeof input.displayName !== "string" && input.displayName !== undefined) ||
        (typeof input.displayName === "string" && input.displayName.length > 200)) return null;
    return { email: input.email.trim(), displayName: typeof input.displayName === "string" ? input.displayName.trim() || null : null };
  } catch {
    return null;
  }
}

export function contactError(error: unknown) {
  const status = error instanceof ContactServiceError || error instanceof MailServiceError ? error.status : "retryable";
  const code = status === "invalid_request" ? 400 : status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "not_found" ? 404 : status === "conflict" ? 409 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
  return contactJson({ status }, code);
}
