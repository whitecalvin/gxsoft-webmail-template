"use client";
import { useTranslations } from "next-intl";
import type { AdminSetupStage } from "@/lib/admin-setup-navigation";

export function AdminSetupGuidance({ stage }: { stage: AdminSetupStage }) {
  const t = useTranslations("adminSetup");
  if (stage === "verify") return <p className="mt-4 text-xs leading-6 text-(--text-muted)">{t("acceptance")}</p>;
  if (stage !== "dns") return null;
  return <section className="mt-4 rounded-sm border border-(--border-app) bg-background p-4">
    <h2 className="mb-2 text-sm font-semibold">{t("manualTitle")}</h2>
    <ul className="list-disc space-y-1 pl-4 text-xs leading-6 text-(--text-muted)"><li>{t("address")}</li><li>{t("ptr")}</li><li>{t("proxy")}</li></ul>
  </section>;
}
