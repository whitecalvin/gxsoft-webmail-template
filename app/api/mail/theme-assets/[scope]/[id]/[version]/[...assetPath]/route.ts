import { tastemailSessionToken } from "@/lib/tastemail/session";
import { themeAssetResponse } from "@/lib/tastemail/theme-assets";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ scope: string; id: string; version: string; assetPath: string[] }> }) {
  const { scope, id, version, assetPath } = await context.params;
  const token = scope === "current" ? await tastemailSessionToken() : null;
  return themeAssetResponse(scope, id, version, assetPath, token);
}
