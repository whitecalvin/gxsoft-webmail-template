import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { ApiConfigurationError, validateApiOrigin } from "@/lib/tastemail/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers });
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function setupTokenValid(supplied: string | null): boolean {
  const expected = process.env.GXWEBMAIL_CONNECTION_SETUP_TOKEN;
  if (!expected || expected.length < 32 || !supplied) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

function localDevelopmentRequest(request: Request, mutation: boolean): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const host = request.headers.get("host");
  try {
    if (!host || !loopbackHosts.has(new URL(`http://${host}`).hostname)) return false;
    if (!loopbackHosts.has(new URL(request.url).hostname)) return false;
  } catch { return false; }
  if (!mutation) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && parsed.protocol === "http:" && loopbackHosts.has(parsed.hostname);
  } catch { return false; }
}

function updateSetting(source: string, key: string, value: string): string {
  const lines = source.split(/\r?\n/u).filter((line) => !new RegExp(`^\\s*${key}\\s*=`).test(line));
  while (lines.at(-1) === "") lines.pop();
  return [...lines, `${key}=${value}`, ""].join(source.includes("\r\n") ? "\r\n" : "\n");
}

export async function GET(request: Request) {
  if (!localDevelopmentRequest(request, false)) return json({ status: "forbidden" }, 403);
  const configured = process.env.TASTEMAIL_API_URL ?? "http://127.0.0.1:6711";
  let apiUrl: string;
  try { apiUrl = validateApiOrigin(configured); }
  catch { return json({ apiUrl: configured, connectionStatus: "invalid_url" }); }
  try {
    const response = await fetch(`${apiUrl}/health`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    if (response.status >= 500) return json({ apiUrl, connectionStatus: "unavailable" });
    const health: unknown = await response.json().catch(() => null);
    const ready = response.ok && health && typeof health === "object" && "service" in health && health.service === "tastedev-mail";
    return json({ apiUrl, connectionStatus: ready ? "ready" : "not_tastemail" });
  } catch { return json({ apiUrl, connectionStatus: "unreachable" }); }
}

export async function POST(request: Request) {
  if (!localDevelopmentRequest(request, true)) return json({ status: "forbidden" }, 403);
  if (!setupTokenValid(request.headers.get("x-gxwebmail-setup-token"))) return json({ status: "unauthorized" }, 401);
  let apiUrl: string;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return json({ status: "invalid_url" }, 400);
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || !("apiUrl" in input) || typeof input.apiUrl !== "string") {
      return json({ status: "invalid_url" }, 400);
    }
    apiUrl = validateApiOrigin(input.apiUrl.trim());
  } catch (error) {
    return json({ status: error instanceof ApiConfigurationError ? "invalid_url" : "invalid_request" }, 400);
  }

  try {
    const response = await fetch(`${apiUrl}/health`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    const health: unknown = await response.json();
    if (!response.ok || !health || typeof health !== "object" || !("service" in health) || health.service !== "tastedev-mail") {
      return json({ status: "not_tastemail" }, 502);
    }
  } catch { return json({ status: "unreachable" }, 502); }

  const file = join(process.cwd(), ".env.development.local");
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const current = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const next = updateSetting(current, "TASTEMAIL_API_URL", apiUrl);
    await writeFile(temporary, next, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, file);
    process.env.TASTEMAIL_API_URL = apiUrl;
    return json({ status: "saved", apiUrl });
  } catch { return json({ status: "save_failed" }, 503); }
  finally { await rm(temporary, { force: true }).catch(() => undefined); }
}
