import { NextResponse } from "next/server";
import { initialSetupStatus, queueInitialSetup, validateInitialSetup, type InitialSetupInput } from "@/lib/tastemail/initial-setup";
import { mailDataMode } from "@/lib/tastemail/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers });

export async function GET() {
  if (mailDataMode() !== "live") return json({ status: "disabled" }, 404);
  return json({ status: await initialSetupStatus() });
}

export async function POST(request: Request) {
  if (mailDataMode() !== "live") return json({ status: "disabled" }, 404);
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
  let parsedOrigin: URL;
  try { parsedOrigin = new URL(origin ?? ""); } catch { return json({ status: "forbidden" }, 403); }
  if (parsedOrigin.host !== host || parsedOrigin.protocol !== `${protocol}:` ||
    (protocol !== "https" && !(protocol === "http" && ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname.toLowerCase())))) {
    return json({ status: "forbidden" }, 403);
  }
  const setupStatus = await initialSetupStatus();
  if (setupStatus !== "pending" && setupStatus !== "error") return json({ status: "unavailable" }, 409);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return json({ status: "invalidRequest" }, 400);
    body = JSON.parse(raw);
  } catch { return json({ status: "invalidRequest" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ status: "invalidRequest" }, 400);
  const data = body as Record<string, unknown>;
  const stringFields = ["setupToken", "hostname", "databaseHost", "databaseUser", "databaseName", "databasePassword", "databaseAdminUser", "databaseAdminPassword", "adminAddress", "password", "passwordConfirmation", "dkimSelector", "webmailListenHost", "apiListenHost", "webmailHostname", "webmailProxyEngine", "cloudflareApiToken"];
  if (stringFields.some((key) => typeof data[key] !== "string") ||
    ["databasePort", "webmailPort", "apiPort"].some((key) => typeof data[key] !== "number") ||
    typeof data.createLocalDatabase !== "boolean" || typeof data.confirmed !== "boolean") return json({ status: "invalidRequest" }, 400);
  const input = data as InitialSetupInput;
  const error = validateInitialSetup(input);
  if (error) return json({ status: error }, 400);
  const result = await queueInitialSetup(input);
  return json({ status: result }, result === "queued" ? 202 : result === "unauthorized" ? 401 : result === "unavailable" ? 503 : 409);
}
