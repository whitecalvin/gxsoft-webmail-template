export type InlineImageSource = { blobId: string; type: string; size: number };
export const MAX_INLINE_IMAGE_BYTES = 5_000_000;
export const MAX_INLINE_IMAGES = 10;
export const RASTER_IMAGE = /^image\/(?:png|jpeg|gif|webp)$/iu;

export async function imageDataUrl(attachment: InlineImageSource, accountId: string | undefined, signal: AbortSignal): Promise<string> {
  if (!RASTER_IMAGE.test(attachment.type) || attachment.size > MAX_INLINE_IMAGE_BYTES) throw new Error("inline image unavailable");
  const params = new URLSearchParams({ blobId: attachment.blobId });
  if (accountId) params.set("accountId", accountId);
  const response = await fetch(`/api/mail/attachments?${params}`, { cache: "no-store", signal });
  if (!response.ok || Number(response.headers.get("content-length")) > MAX_INLINE_IMAGE_BYTES || !response.body) throw new Error("inline image unavailable");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_INLINE_IMAGE_BYTES || signal.aborted) {
      await reader.cancel();
      throw new Error("inline image unavailable");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const part of parts) { bytes.set(part, position); position += part.byteLength; }
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return `data:${attachment.type.toLowerCase()};base64,${btoa(chunks.join(""))}`;
}
