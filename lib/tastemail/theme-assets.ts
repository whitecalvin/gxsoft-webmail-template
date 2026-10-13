import "server-only";
import { safeThemeAsset } from "@/lib/theme-assets";
import { loadServerTheme } from "./theme";
import { tastemailRequest } from "./server";

function headers(mime: string) {
  return { "content-type": mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin", "content-security-policy": "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; sandbox" };
}
function failure(status: number): Response { return Response.json({ status: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not_found" : status === 409 ? "conflict" : "unavailable" }, { status, headers: { "cache-control": "no-store" } }); }
async function boundedBytes(response: Response, maximum: number): Promise<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) { await response.body?.cancel(); throw new Error("Asset too large"); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maximum) throw new Error("Asset too large"); chunks.push(value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function themeAssetResponse(scope: string, id: string, version: string, segments: string[], token: string | null): Promise<Response> {
  const asset = safeThemeAsset(segments);
  if (!asset || !["current", "system"].includes(scope) || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || id.length > 64 || version.length > 80 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version)) return failure(400);

  if (scope === "current" && !token) return failure(401);
  // Anonymous system assets never inherit a browser's session credential.
  const credential = scope === "current" ? token : null;
  try {
    const resolved = await loadServerTheme(credential);
    if (!resolved || resolved.source === "fallback") return failure(503);
    if (resolved.theme.id !== id || resolved.theme.version !== version) return failure(409);
    const path = asset.path.split("/").map(encodeURIComponent).join("/");
    const upstream = scope === "current" ? `/api/themes/assets/${encodeURIComponent(id)}/${encodeURIComponent(version)}/${path}` : `/api/themes/system/assets/${path}`;
    const response = await tastemailRequest(upstream, credential ?? undefined, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { await response.body?.cancel(); return failure([401, 403, 404, 429].includes(response.status) ? response.status : 503); }
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (mime !== asset.mime) { await response.body?.cancel(); return failure(502); }
    const bytes = await boundedBytes(response, asset.maxBytes);
    return new Response(bytes as BodyInit, { headers: headers(asset.mime === "text/css" ? "text/css; charset=utf-8" : asset.mime) });
  } catch { return failure(502); }
}
