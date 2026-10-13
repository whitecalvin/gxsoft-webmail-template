/** Client-side preflight only; the API must independently validate the bytes. */
export const HEADER_BRANDING_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type HeaderBrandingImageLimits = { maxBytes: number; maxWidth: number; maxHeight: number };
export type HeaderBrandingImageError = "type" | "size" | "dimensions" | "decode";

export async function validateHeaderBrandingImage(file: File, limits: HeaderBrandingImageLimits): Promise<HeaderBrandingImageError | null> {
  if (!(HEADER_BRANDING_IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  if (!file.size || file.size > limits.maxBytes) return "size";
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return "decode"; }
  try {
    return bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= limits.maxWidth && bitmap.height <= limits.maxHeight ? null : "dimensions";
  } finally { bitmap.close(); }
}
