"use client";
import { AdminQuarantine } from "./AdminQuarantine";
import { AdminSharedMailboxes } from "./AdminSharedMailboxes";
import { AdminUsageReport } from "./AdminUsageReport";
import { LiveAdminManager } from "./LiveAdminManager";
import { useAdminShell } from "./AdminShell";
import type { AdminResource } from "@/lib/tastemail/admin-management";
import type { AdminInitialState } from "@/lib/admin-initial-state";
import type { AdminSetupStage } from "@/lib/admin-setup-navigation";
import { ImageAssetSettings } from "@/components/settings/ImageAssetSettings";
export function LiveAdminSection({ section, initial, fixedDomain, refreshPageOnMutation, setupStage }: { section: AdminResource | "quarantine" | "shared-mailboxes"; initial?: AdminInitialState; fixedDomain?: string; refreshPageOnMutation?: boolean; setupStage?: AdminSetupStage }) {
  const { setMutationBusy } = useAdminShell();
  const snapshot = initial?.section === section ? initial : undefined;
  const error = snapshot?.error ?? undefined;
  return section === "reports" ? <AdminUsageReport initialUsage={snapshot?.management?.usage} initialError={error} /> : section === "shared-mailboxes" ? <AdminSharedMailboxes initialItems={snapshot?.shared} initialError={error} /> : section === "quarantine" ? <AdminQuarantine initialPage={snapshot?.quarantine} initialError={error} onBusyChange={setMutationBusy} /> : <>{section === "branding" ? <div className="mb-4"><ImageAssetSettings scope="brand" /></div> : null}<LiveAdminManager key={`${section}:${fixedDomain ?? ""}`} resource={section} initialData={snapshot?.management} initialError={error} dkimDomains={snapshot?.dkimDomains} onBusyChange={setMutationBusy} fixedDomain={fixedDomain} refreshPageOnMutation={refreshPageOnMutation} setupStage={setupStage} /></>;
}
