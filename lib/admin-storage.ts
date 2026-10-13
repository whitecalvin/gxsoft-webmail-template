const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

export function adminStorageSize(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Invalid storage size");
  let value = bytes, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return { value, unit: units[index] };
}

export function adminStorageProgress(used: number, quota: number) {
  adminStorageSize(used); adminStorageSize(quota);
  // 0 용량을 무제한으로 추측하지 않고 원본과 동일하게 막대를 생략합니다.
  return quota === 0 ? null : { max: quota, value: Math.min(used, quota), exceeded: used > quota };
}
