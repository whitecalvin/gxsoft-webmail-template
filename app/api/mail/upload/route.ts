import { NextResponse } from "next/server";
import { assertLiveApiConfigured, serviceStatus, tastemailRequest } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function serviceHttpStatus(status: ReturnType<typeof serviceStatus>): number {
  return status === "unauthorized" ? 401 : status === "forbidden" ? 403 :
    status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return json({ status: "forbidden" }, 403);
  try {
    const url = new URL(request.url);
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.slice(0, -1);
    if (origin !== `${protocol}://${request.headers.get("host") ?? url.host}`) return json({ status: "forbidden" }, 403);
  } catch { return json({ status: "forbidden" }, 403); }
  try {

    assertLiveApiConfigured();
  } catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  const name = new URL(request.url).searchParams.get("name");
  const requestedAccountId = new URL(request.url).searchParams.get("accountId");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  if (requestedAccountId !== null && !uuidPattern.test(requestedAccountId)) return json({ status: "invalid_request" }, 400);
  if (!name || new TextEncoder().encode(name).length > 180 || !request.body) return json({ status: "invalid_request" }, 400);
  try {
    const sessionResponse = await tastemailRequest("/.well-known/jmap", token);
    if (!sessionResponse.ok) {
      const status = serviceStatus(sessionResponse.status);
      return json({ status }, serviceHttpStatus(status));
    }
    const session: unknown = await sessionResponse.json();
    const personalAccountId = session && typeof session === "object" && "primaryAccounts" in session
      ? (session.primaryAccounts as Record<string, unknown>)?.["urn:ietf:params:jmap:mail"] : null;
    if (typeof personalAccountId !== "string" || !uuidPattern.test(personalAccountId)) return json({ status: "unavailable" }, 502);
    const accountId = requestedAccountId ?? personalAccountId;
    if (requestedAccountId) {
      const accounts = session && typeof session === "object" && "accounts" in session ? session.accounts as Record<string, unknown> : null;
      const account = accounts?.[requestedAccountId] as Record<string, unknown> | undefined;
      const rights = account?.["x-tastemail-rights"] as Record<string, unknown> | undefined;
      if (!account || account.isPersonal !== false || rights?.mayRead !== true || rights.mayWrite !== true || rights.maySend !== true) {
        return json({ status: "forbidden" }, 403);
      }
    }
    const contentType = request.headers.get("content-type") || "application/octet-stream";
    const upstream = await tastemailRequest(`/jmap/upload/${encodeURIComponent(accountId)}`, token, {
      method: "POST", headers: { "content-type": contentType }, body: request.body,
      // Node fetch requires duplex for streamed request bodies.
      duplex: "half", signal: AbortSignal.timeout(60_000),
    } as RequestInit & { duplex: "half" });
    if (upstream.status === 413) return json({ status: "tooLarge" }, 413);
    if (upstream.status === 507) return json({ status: "overQuota" }, 507);
    if (!upstream.ok) {
      const status = serviceStatus(upstream.status);
      return json({ status }, serviceHttpStatus(status));
    }
    const value: unknown = await upstream.json();
    if (!value || typeof value !== "object") return json({ status: "unavailable" }, 502);
    const item = value as Record<string, unknown>;
    if (typeof item.accountId !== "string" || item.accountId.toLowerCase() !== accountId.toLowerCase() ||
      typeof item.blobId !== "string" || !/^u:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(item.blobId) ||
      typeof item.type !== "string" || !item.type || typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size <= 0) return json({ status: "unavailable" }, 502);
    return json({ blobId: item.blobId, name, type: item.type, size: item.size }, 201);
  } catch { return json({ status: "retryable" }, 503); }
}
