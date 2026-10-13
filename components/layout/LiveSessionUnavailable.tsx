import { getTranslations } from "next-intl/server";
import type { PageSessionStatus } from "@/lib/tastemail/page-session";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

export async function LiveSessionUnavailable({ status }: { status: Exclude<PageSessionStatus, "ready"> }) {
  const t = await getTranslations("liveService");
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-5 text-center text-sm text-(--text-muted)">
    <SystemErrorNotice message={t(status)} actionLabel={t("retry")} reloadOnAction />
  </main>;
}
