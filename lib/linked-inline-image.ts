import type { LinkedAttachment, LinkedMailDetail } from "./linked-mail";
import { MAX_INLINE_IMAGE_BYTES, MAX_INLINE_IMAGES, RASTER_IMAGE } from "./inline-image";
export function linkedInlinePlan(detail: LinkedMailDetail): { images: LinkedAttachment[]; unavailable: boolean } {
  const references = new Set<string>();
  for (const match of (detail.body.htmlBody ?? "").matchAll(/\bsrc\s*=\s*(["']?)cid:([^\s"'>]+)\1/giu)) references.add(match[2].toLowerCase());
  const images: LinkedAttachment[] = []; let unavailable = false;
  for (const cid of references) {
    const matching = detail.attachments.filter(a => a.cid?.toLowerCase() === cid);
    const image = matching[0];
    if (matching.length !== 1 || !image || image.disposition !== "inline" || !RASTER_IMAGE.test(image.contentType) || image.size < 1 || image.size > MAX_INLINE_IMAGE_BYTES || images.length >= MAX_INLINE_IMAGES) { unavailable = true; continue; }
    images.push(image);
  }
  return { images, unavailable };
}
export async function linkedRasterDataUrl(blob: Blob, image: LinkedAttachment): Promise<string> {
  const type = image.contentType.toLowerCase();
  if (!RASTER_IMAGE.test(type) || blob.size !== image.size || blob.size < 1 || blob.size > MAX_INLINE_IMAGE_BYTES) throw new Error("inline image unavailable");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const prefix = (values: number[], start = 0) => values.every((value, i) => bytes[start + i] === value);
  const valid = type === "image/png" ? prefix([137, 80, 78, 71, 13, 10, 26, 10]) : type === "image/jpeg" ? prefix([255, 216, 255]) : type === "image/gif" ? prefix([71, 73, 70, 56, 55, 97]) || prefix([71, 73, 70, 56, 57, 97]) : prefix([82, 73, 70, 70]) && prefix([87, 69, 66, 80], 8);
  if (!valid) throw new Error("inline image unavailable");
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return `data:${type};base64,${btoa(chunks.join(""))}`;
}
