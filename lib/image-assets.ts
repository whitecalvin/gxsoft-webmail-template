import type { LocalImageLimits } from "./local-image-file";
export type ImageScope = "brand" | "avatar";
export type ImageSnapshot = { revision: number; image: null | { assetId: string; mediaType: "image/png"; width: number; height: number; sizeBytes: number; sha256: string; url: string } };
export const IMAGE_LIMITS: LocalImageLimits = { mimeTypes: ["image/png", "image/jpeg", "image/webp"], maxBytes: 2097152, maxWidth: 2048, maxHeight: 2048, maxPixels: 4194304 };
export const imageUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function imageAssetFailure(status: number, value?: unknown): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rateLimited";
  if (status === 409) return "conflict";
  if (status === 413) return "size";
  const error = value && typeof value === "object" && "error" in value ? value.error : null;
  if (status === 400 && error === "invalidImage") return "decode";
  return "failed";
}
export function imageSnapshot(value: unknown, scope: ImageScope): ImageSnapshot {
  if (!value || typeof value !== "object") throw new Error("invalidImageState");
  const row = value as ImageSnapshot;
  if (!Number.isSafeInteger(row.revision) || row.revision < 0) throw new Error("invalidImageState");
  if (row.image === null) return { revision: row.revision, image: null };
  const image = row.image;
  if (!image || !imageUuid.test(image.assetId) || image.mediaType !== "image/png" || !/^[a-f0-9]{64}$/i.test(image.sha256) ||
      ![image.width, image.height, image.sizeBytes].every(n => Number.isSafeInteger(n) && n > 0) || image.width > 2048 || image.height > 2048 || image.sizeBytes > 20971520) throw new Error("invalidImageState");
  const path = scope === "brand" ? "/api/branding/image" : "/api/user/avatar";
  if (image.url !== `${path}/${image.assetId}` && image.url !== `/api/mail/images/${scope}/${image.assetId}`) throw new Error("invalidImageState");
  return { revision: row.revision, image: { assetId: image.assetId, mediaType: "image/png", width: image.width, height: image.height, sizeBytes: image.sizeBytes, sha256: image.sha256, url: `/api/mail/images/${scope}/${image.assetId}` } };
}
