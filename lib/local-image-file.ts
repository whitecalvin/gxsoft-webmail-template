export type LocalImageMime = "image/png" | "image/jpeg" | "image/webp";
export type LocalImageLimits = { mimeTypes: readonly LocalImageMime[]; maxBytes: number; maxWidth: number; maxHeight: number; maxPixels: number };
export type LocalImageFailure = "format" | "size" | "dimensions" | "decode";
export class LocalImageError extends Error {
  constructor(public reason: LocalImageFailure) { super(reason); }
}

// 서버 제한을 호출자가 전달한다. 파일 확장자/accept 속성만으로 파일을 신뢰하지 않는다.
export async function inspectLocalImage(file: File, limits: LocalImageLimits) {
  if (!limits.mimeTypes.includes(file.type as LocalImageMime)) throw new LocalImageError("format");
  if (file.size <= 0 || file.size > limits.maxBytes) throw new LocalImageError("size");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = file.type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    : file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : [82, 73, 70, 70].every((value, index) => bytes[index] === value) && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value);
  if (!matches) throw new LocalImageError("format");
  let finished = false;
  let bitmap: ImageBitmap | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const decoded = createImageBitmap(file).then(value => {
      // 제한 시간 이후 도착한 디코딩 결과도 메모리에 남기지 않는다.
      if (finished) { value.close(); throw new LocalImageError("decode"); }
      return value;
    });
    bitmap = await Promise.race([decoded, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LocalImageError("decode")), 10_000);
    })]);
    const { width, height } = bitmap;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > limits.maxWidth || height > limits.maxHeight || width * height > limits.maxPixels) throw new LocalImageError("dimensions");
    return { width, height };
  } catch (error) {
    throw error instanceof LocalImageError ? error : new LocalImageError("decode");
  } finally {
    finished = true;
    clearTimeout(timer);
    bitmap?.close();
  }
}
