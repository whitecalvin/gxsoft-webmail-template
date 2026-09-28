import { NextResponse } from "next/server";
import { loadLiveSharedMailPage, MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

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
  const accountId = params.get("accountId") ?? "";
  const mailboxId = params.get("mailboxId");
  const positionValue = params.get("position") ?? "0";
  if (!/^[0-9a-fA-F-]{36}$/u.test(accountId) || (mailboxId !== null && !/^[0-9a-fA-F-]{36}$/u.test(mailboxId)) ||
    !/^(0|[1-9]\d*)$/u.test(positionValue) || Number(positionValue) > 100_000) {
    return json({ status: "invalid_request" }, 400);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try {
    return json(await loadLiveSharedMailPage(token, accountId, mailboxId, Number(positionValue)));
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
