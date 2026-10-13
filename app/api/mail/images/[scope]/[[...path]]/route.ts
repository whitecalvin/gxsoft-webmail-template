import { NextResponse } from "next/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { tastemailRequest } from "@/lib/tastemail/server";
import { imageSnapshot, imageUuid, IMAGE_LIMITS } from "@/lib/image-assets";
export const runtime = "nodejs";
type Context = { params: Promise<{ scope: string; path?: string[] }> };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request: Request, context: Context) {
  const { scope, path = [] } = await context.params;
  if (scope !== "brand" && scope !== "avatar") return json({ error: "notFound" }, 404);
  const read = request.method === "GET";
  const receipt = read && path.length === 2 && path[0] === "receipts" && imageUuid.test(path[1]);
  const bytes = read && path.length === 1 && imageUuid.test(path[0]);
  if (path.length && !receipt && !bytes) return json({ error: "notFound" }, 404);
  if (!read && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "forbidden" }, 403);
  const token = scope === "avatar" || !read || receipt ? await tastemailSessionToken() : null;
  if ((scope === "avatar" || !read || receipt) && !token) return json({ error: "unauthorized" }, 401);
  const base = scope === "brand" ? (!read || receipt ? "/api/admin/branding/image" : "/api/branding/image") : "/api/user/avatar";
  let query = "";
  if (!read) {
    const params = new URL(request.url).searchParams;
    const revision = params.get("expectedRevision"), id = params.get("requestId");
    if (!revision || !/^\d+$/.test(revision) || !Number.isSafeInteger(Number(revision)) || !id || !imageUuid.test(id)) return json({ error: "invalidRequest" }, 400);
    query = `?expectedRevision=${revision}&requestId=${id}`;
  }
  let body: Uint8Array | undefined;
  if (request.method === "PUT") {
    if (!(IMAGE_LIMITS.mimeTypes as readonly string[]).includes(request.headers.get("content-type") ?? "") || !request.body) return json({ error: "invalidImage" }, 400);
    const reader = request.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0, complete = false;
    let reject!: () => void;
    const interrupted = new Promise<never>((_, fail) => { reject = () => fail(new Error("interrupted")); });
    const timer = setTimeout(reject, 10000);
    request.signal.addEventListener("abort", reject, { once: true });
    try {
      while (true) { if (request.signal.aborted) throw new Error("interrupted"); const result = await Promise.race([reader.read(), interrupted]); if (result.done) break; size += result.value.byteLength; if (size > IMAGE_LIMITS.maxBytes) return json({ error: "tooLarge" }, 413); chunks.push(result.value); }
      if (!size) return json({ error: "invalidImage" }, 400);
      body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; } complete = true;
    } catch { return json({ error: "invalidRequest" }, 400); }
    finally { clearTimeout(timer); request.signal.removeEventListener("abort", reject); if (!complete) void reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  try {
    const upstream = await tastemailRequest(`${base}${path.length ? `/${path.join("/")}` : ""}${query}`, token ?? undefined, { method: request.method, headers: body ? { "Content-Type": request.headers.get("content-type")! } : undefined, body: body as BodyInit | undefined, signal: AbortSignal.timeout(15000) });
    if (bytes && upstream.ok) {
      if (upstream.headers.get("content-type") !== "image/png") return json({ error: "serverFail" }, 502);
      return new Response(upstream.body, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
    }
    const value = await upstream.json().catch(() => ({ error: "invalidRequest" }));
    if (!upstream.ok) {
      const kind = value?.type;
      const allowed = ["unauthorized", "forbidden", "notFound", "invalidRequest", "invalidImage", "tooLarge", "revisionMismatch", "requestIdConflict", "receiptLimit", "imageBusy", "serverFail", "resultUnknown"];
      return json({ error: allowed.includes(kind) ? kind : "serverFail" }, upstream.status);
    }
    if (read && !receipt) return json(imageSnapshot(value, scope));
    const snapshot = imageSnapshot(value, scope);
    if (!imageUuid.test(value.requestId) || !["replace", "delete"].includes(value.operation) || !Number.isSafeInteger(value.previousRevision) || value.revision !== value.previousRevision + 1) return json({ error: "resultUnknown" }, 503);
    return json({ requestId: value.requestId, operation: value.operation, previousRevision: value.previousRevision, ...snapshot });
  } catch { return json({ error: read ? "serverFail" : "resultUnknown" }, 503); }
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
