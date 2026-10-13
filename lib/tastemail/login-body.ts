import "server-only";

const MAX_CHARACTERS = 4096;
const MAX_BYTES = 16 * 1024;
const READ_TIMEOUT_MS = 5000;

// 기존 문자열 길이 계약을 유지하되, 본문 전체를 메모리에 읽기 전에 제한한다.
export async function readLoginBody(request: Request): Promise<unknown> {
  if (!request.body || request.signal.aborted) throw new Error("Invalid login body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const deadline = Date.now() + READ_TIMEOUT_MS;
  let bytes = 0;
  let raw = "";
  let complete = false;
  let rejectInterrupted!: (reason: Error) => void;
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupted = reject; });
  const onAbort = () => rejectInterrupted(new Error("Login body interrupted"));
  const timer = setTimeout(onAbort, READ_TIMEOUT_MS);
  request.signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      if (request.signal.aborted || Date.now() >= deadline) throw new Error("Login body interrupted");
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("Login body too large");
      raw += decoder.decode(value, { stream: true });
      if (raw.length > MAX_CHARACTERS) throw new Error("Login body too large");
    }
    raw += decoder.decode();
    if (raw.length > MAX_CHARACTERS || request.signal.aborted || Date.now() >= deadline) throw new Error("Invalid login body");
    const body: unknown = JSON.parse(raw);
    complete = true;
    return body;
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    // 취소가 끝나지 않는 스트림도 오류 응답을 지연시키지 않도록 기다리지 않는다.
    if (!complete) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
