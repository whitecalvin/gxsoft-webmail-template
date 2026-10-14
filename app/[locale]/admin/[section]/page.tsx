import { notFound } from "next/navigation";

import { isAdminSection } from "@/lib/admin-navigation";
import { LiveAdminSection } from "@/components/admin/LiveAdminSection";
import { AdminUsageReport } from "@/components/admin/AdminUsageReport";
import { loadAdminInitialState } from "@/lib/tastemail/admin-initial";
import { tastemailSessionToken } from "@/lib/tastemail/session";
export default async function AdminSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams?: Promise<{ domain?: string | string[] }> }) {
  const { section } = await params;
  if (!isAdminSection(section) || section === "dashboard" || section === "system" || section === "onboarding" || section === "gmail-oauth") notFound();
  const requested = section === "dkim" ? (await searchParams)?.domain : undefined;
  const initial = await loadAdminInitialState(section, await tastemailSessionToken(), typeof requested === "string" ? requested : undefined);
  if (section === "reports") {
    return <AdminUsageReport initialUsage={initial.management?.usage} initialError={initial.error ?? (initial.management?.usage ? undefined : "unavailable")} />;
  }
  return <LiveAdminSection section={section} initial={initial} />;
}
