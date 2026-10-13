"use client";
import { useRouter } from "@/i18n/navigation";
import { useAdminShell } from "./AdminShell";
import { LiveAdminConsole } from "./LiveAdminConsole";
import { useAdminDraftGuard } from "./AdminDraftGuard";

export function AdminSetupVerify() {
  const { initial } = useAdminShell();
  const router = useRouter(), { requestAction } = useAdminDraftGuard();
  // 요약과 상세가 같은 새 SSR 관측값을 사용하도록 함께 갱신합니다.
  return <LiveAdminConsole key={initial.observedAt} onRefresh={() => requestAction(() => router.refresh())} />;
}
