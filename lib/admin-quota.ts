export const BYTES_PER_GIB = 1024 ** 3;
export const MAX_QUOTA_GIB = 1048576;

export function quotaGiBValue(bytes: unknown): string {
  const value = typeof bytes === "string" && /^\d+$/.test(bytes) ? Number(bytes) : bytes;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUOTA_GIB * BYTES_PER_GIB
    ? String(value / BYTES_PER_GIB) : "";
}

// 원본 관리자와 동일한 GiB → 바이트 반올림 계약을 유지합니다.
export function quotaBytesValue(gib: string): string | null {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(gib)) return null;
  const value = Number(gib);
  if (!Number.isFinite(value) || value < 0 || value > MAX_QUOTA_GIB) return null;
  return String(Math.round(value * BYTES_PER_GIB));
}
