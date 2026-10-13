
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AdminSetupNavigation, AdminSetupFooter } from "@/components/admin/AdminSetupNavigation";
import { AdminSetupReadiness } from "@/components/admin/AdminSetupReadiness";
import { AdminSetupGuidance } from "@/components/admin/AdminSetupGuidance";
import { LiveAdminSection } from "@/components/admin/LiveAdminSection";
import { AdminSetupVerify } from "@/components/admin/AdminSetupVerify";
import { adminSetupDomain, adminSetupStage } from "@/lib/admin-setup-navigation";
import { loadAdminSetup } from "@/lib/tastemail/admin-setup";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ stage?: string | string[]; domain?: string | string[] }> }) {
  const query = await searchParams;
  const stage = adminSetupStage(query.stage);
  const resource = stage === "domain" ? "domains" : stage === "mailbox" ? "users" : "dkim";
  const requestedDomain = adminSetupDomain(query.domain);
  const { initial, domain, dkim, users } = await loadAdminSetup(await tastemailSessionToken(), stage, requestedDomain);
  const remote = await getTranslations("adminRemote");
  const manage = await getTranslations("adminManage");
  return <>
    <AdminSetupNavigation stage={stage} domain={domain} />
    <AdminSetupReadiness domain={domain} dkim={dkim} users={users} />
    {stage !== "domain" && !domain ? <p role="status" className="rounded-sm border border-(--border-app) bg-background p-4 text-sm">{manage("dkimDomainRequired")}</p> : stage === "verify" ? <><div className="mb-4"><Link href="/admin/system" className="inline-flex min-h-11 items-center rounded-sm border border-(--border-app) bg-background px-4 text-xs hover:bg-(--surface-muted)">{remote("title")}</Link></div><AdminSetupVerify /></> : <LiveAdminSection key={`${stage}:${domain ?? ""}`} section={resource} initial={initial} fixedDomain={stage === "mailbox" ? domain : undefined} refreshPageOnMutation setupStage={stage} />}
    <AdminSetupGuidance stage={stage} />
    <AdminSetupFooter stage={stage} domain={domain} />
  </>;
}
