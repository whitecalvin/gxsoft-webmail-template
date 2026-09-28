import { createLiveContact, loadLiveContacts } from "@/lib/tastemail/contacts";
import { contactError, contactInput, contactJson as json, sameOrigin } from "@/lib/tastemail/contact-route";
import { MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try {
    return json({ contacts: await loadLiveContacts(token) });
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const httpStatus = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, httpStatus);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  const input = await contactInput(request);
  if (!input) return json({ status: "invalid_request" }, 400);
  try {
    return json({ contact: await createLiveContact(token, input) }, 201);
  } catch (error) {
    return contactError(error);
  }
}
