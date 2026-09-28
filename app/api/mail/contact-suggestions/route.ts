import { loadLiveAddressSuggestions } from "@/lib/tastemail/contacts";
import { contactJson as json } from "@/lib/tastemail/contact-route";
import { MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query || [...query].length > 200 || /[\u0000-\u001f\u007f]/u.test(query)) {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    return json({ suggestions: await loadLiveAddressSuggestions(token, query) });
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const httpStatus = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, httpStatus);
  }
}
