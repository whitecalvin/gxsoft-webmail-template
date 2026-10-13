import "server-only";
import { tastemailRequest } from "./server";
import { imageSnapshot, type ImageScope } from "@/lib/image-assets";
export async function loadImageSnapshot(scope: ImageScope, token?: string | null) {
  if (scope === "avatar" && !token) return null;
  try {
    const response = await tastemailRequest(scope === "brand" ? "/api/branding/image" : "/api/user/avatar", scope === "avatar" ? token! : undefined, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    return imageSnapshot(await response.json(), scope);
  } catch { return null; }
}
