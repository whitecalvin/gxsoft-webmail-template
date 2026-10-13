export type UploadReceipt = { blobId: string; name: string; type: string; size: number };

/** The same-origin upload route returns the original name and stored byte count. */
export function requireUploadReceipt(value: unknown, file: { name: string; size: number }): UploadReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("unavailable");
  const item = value as Record<string, unknown>;
  if (typeof item.blobId !== "string" || !/^u:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(item.blobId) ||
    item.name !== file.name || typeof item.type !== "string" || !item.type.trim() ||
    typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size <= 0 || item.size !== file.size) {
    throw new Error("unavailable");
  }
  return { blobId: item.blobId, name: file.name, type: item.type, size: item.size };
}
