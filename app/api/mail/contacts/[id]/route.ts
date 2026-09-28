import { deleteLiveContact, updateLiveContact } from "@/lib/tastemail/contacts";
import { contactError, contactInput, contactJson as json, sameOrigin } from "@/lib/tastemail/contact-route";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function authorizedContactRequest(request: Request, context: Context) {
  if (!sameOrigin(request)) return { error: json({ status: "forbidden" }, 403) };
  try {
    if (mailDataMode() !== "live") return { error: json({ status: "mock_only" }, 404) };
    assertLiveApiConfigured();
  } catch {
    return { error: json({ status: "configuration_error" }, 503) };
  }
  const token = await tastemailSessionToken();
  if (!token) return { error: json({ status: "unauthorized" }, 401) };
  const { id } = await context.params;
  if (!UUID.test(id)) return { error: json({ status: "invalid_request" }, 400) };
  return { token, id };
}

export async function PATCH(request: Request, context: Context) {
  const auth = await authorizedContactRequest(request, context);
  if (auth.error) return auth.error;
  const input = await contactInput(request);
  if (!input) return json({ status: "invalid_request" }, 400);
  try {
    return json({ contact: await updateLiveContact(auth.token!, auth.id!, input) });
  } catch (error) {
    return contactError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await authorizedContactRequest(request, context);
  if (auth.error) return auth.error;
  try {
    await deleteLiveContact(auth.token!, auth.id!);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return contactError(error);
  }
}
