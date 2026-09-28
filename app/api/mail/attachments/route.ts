import { NextResponse } from "next/server";
import { assertLiveApiConfigured, mailDataMode, serviceStatus, tastemailRequest } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

const MAIL = "urn:ietf:params:jmap:mail";
const MESSAGE_BLOB_ID = /^m:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]+$/iu;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const params = new URL(request.url).searchParams;
  const blobId = params.get("blobId");
  const requestedAccountId = params.get("accountId");
  if (!blobId || !MESSAGE_BLOB_ID.test(blobId) ||
    (requestedAccountId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(requestedAccountId))) {
    return json({ status: "invalid_request" }, 400);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try {
    const session = await tastemailRequest("/.well-known/jmap", token);
    if (!session.ok) {
      const status = serviceStatus(session.status);
      return json({ status }, session.status);
    }
    const payload = object(await session.json());
    const primaryAccountId = object(payload?.primaryAccounts)?.[MAIL];
    if (typeof primaryAccountId !== "string" || !/^[0-9a-f-]{36}$/iu.test(primaryAccountId)) return json({ status: "unavailable" }, 502);
    const accountId = requestedAccountId ?? primaryAccountId;
    if (requestedAccountId && requestedAccountId !== primaryAccountId) {
      const account = object(object(payload?.accounts)?.[requestedAccountId]);
      const rights = object(account?.["x-tastemail-rights"]);
      if (!account || account.isPersonal !== false || rights?.mayRead !== true) {
        return json({ status: "forbidden" }, 403);
      }
    }

    const upstream = await tastemailRequest(`/jmap/download/${encodeURIComponent(accountId)}/${encodeURIComponent(blobId)}/attachment`, token, {
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!upstream.ok) {
      if (upstream.status === 404) return json({ status: "not_found" }, 404);
      const status = serviceStatus(upstream.status);
      const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
      return json({ status }, code);
    }
    if (!upstream.body) return json({ status: "unavailable" }, 502);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return json({ status: "retryable" }, 503);
  }
}
