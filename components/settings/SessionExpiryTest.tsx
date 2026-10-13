"use client";
import { startTransition, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { testCurrentSessionExpiry } from "@/lib/tastemail/session-expiry-action";

// 승인된 한국어 개발 검수 전용이며 제품 설정 메뉴에는 등록하지 않습니다.
export function SessionExpiryTest({ sessionId }: { sessionId: string }) {
  const service = useTranslations("liveService");
  const lock = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof testCurrentSessionExpiry>> | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setConfirm(false);
    startTransition(async () => {
      try { setResult(await testCurrentSessionExpiry(sessionId, true)); }
      catch { setResult({ status: "mutationUncertain" }); }
      finally { setBusy(false); }
    });
  };
  return <section className="mx-auto max-w-3xl space-y-4 p-5">
    <h1 className="text-xl font-semibold">개발용 현재 세션 만료 검증</h1>
    <p>서버에서 별도 승인한 현재 세션만 최대 2분 뒤 만료합니다. 다른 세션·전역 정책은 변경하지 않습니다. 테스트 후 재로그인이 필요합니다.</p>
    <p className="break-all text-sm">대상 UUID: {sessionId}</p>
    <Button disabled={busy || !!result} onClick={() => setConfirm(true)}>현재 세션 만료 테스트</Button>
    {busy ? <p role="status">{service("loading")}</p> : null}
    {result ? <p role="status">{result.status === "requested" ? `만료 요청 확인됨 · 서버 시각 ${result.serverTime} · 만료 시각 ${result.expiresAt}` : result.status === "unsupported" ? "현재 서버에 테스트 승인이 설정되지 않았거나 개발 환경이 아닙니다." : result.status === "mutationUncertain" ? "만료 요청 결과가 불확실합니다. 다시 실행하지 말고 현재 세션 상태를 확인하세요." : service(result.status)}</p> : null}
    {confirm ? <ConfirmDialog tone="warning" title="현재 세션을 최대 2분 뒤 만료할까요?" description="재로그인이 필요합니다. 승인된 이 UUID의 세션만 변경합니다." confirmLabel="만료 테스트 실행" cancelLabel="취소" onCancel={() => setConfirm(false)} onConfirm={run} /> : null}
  </section>;
}
