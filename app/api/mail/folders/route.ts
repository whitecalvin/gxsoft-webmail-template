import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/tastemail/contact-route";
import { MailServiceError } from "@/lib/tastemail/mail";
import { personalFolderInput } from "@/lib/tastemail/personal-folder-contract";
import { changePersonalFolder, PersonalFolderError } from "@/lib/tastemail/personal-folders";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try {

    assertLiveApiConfigured();
  } catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  let value: unknown;
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error();
    const text = await request.text();
    if (text.length > 2048) throw new Error();
    value = JSON.parse(text);
  } catch { return json({ status: "invalid_request" }, 400); }
  const input = personalFolderInput(value);
  if (!input) return json({ status: "invalid_request" }, 400);
  try { return json(await changePersonalFolder(token, input)); }
  catch (error) {
    const status = error instanceof PersonalFolderError || error instanceof MailServiceError ? error.status : "unavailable";
    const code = status === "invalid_request" ? 400 : status === "unauthorized" ? 401 : status === "forbidden" ? 403
      : status === "not_found" ? 404 : status === "conflict" ? 409 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
