"use client";

import { useState } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminMobileMenu } from "@/components/admin/mobile/AdminMobileMenu";
import { AdminMobileScreen } from "@/components/admin/mobile/AdminMobileScreen";
import { MOBILE_ADMIN_SCREENS } from "@/lib/mock-admin-mobile";
import type { AdminTabId } from "@/types/admin";
import { DashboardTab } from "@/components/admin/tabs/DashboardTab";
import { UsersTab } from "@/components/admin/tabs/UsersTab";
import { PolicyTab } from "@/components/admin/tabs/PolicyTab";
import { SecurityTab } from "@/components/admin/tabs/SecurityTab";
import { FlowTab } from "@/components/admin/tabs/FlowTab";
import { GroupsTab } from "@/components/admin/tabs/GroupsTab";
import { AuditTab } from "@/components/admin/tabs/AuditTab";
import { BackupTab } from "@/components/admin/tabs/BackupTab";
import { ReportsTab } from "@/components/admin/tabs/ReportsTab";
import { MigrationTab } from "@/components/admin/tabs/MigrationTab";
import { BrandTab } from "@/components/admin/tabs/BrandTab";
import { ApiTab } from "@/components/admin/tabs/ApiTab";
import { BillingTab } from "@/components/admin/tabs/BillingTab";

// Admin Console shell (/admin): swaps in one of 13 tab components based on
// AdminNav selection. Below `lg`, it instead shows a menu of mocked mobile
// screens (MOBILE_ADMIN_SCREENS) that are read-only previews, not wired to
// the same state as the desktop tabs.
const TAB_COMPONENTS: Record<AdminTabId, React.ComponentType> = {
  dash: DashboardTab,
  users: UsersTab,
  policy: PolicyTab,
  security: SecurityTab,
  flow: FlowTab,
  groups: GroupsTab,
  audit: AuditTab,
  backup: BackupTab,
  reports: ReportsTab,
  migration: MigrationTab,
  brand: BrandTab,
  api: ApiTab,
  billing: BillingTab,
};

// Tabs whose content isn't time-series based, so the header's date-range
// picker would be meaningless (or is replaced by more relevant filters).
const NO_RANGE_TABS = new Set<AdminTabId>(["brand", "api", "billing", "audit", "backup"]);

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTabId>("dash");
  const [mobileScreenId, setMobileScreenId] = useState<string | null>(null);
  const TabBody = TAB_COMPONENTS[tab];
  const mobileScreen = MOBILE_ADMIN_SCREENS.find((s) => s.id === mobileScreenId);

  return (
    <main className="flex h-dvh w-full bg-(--surface-muted) text-foreground">
      <div className="min-h-0 w-full lg:hidden">
        {mobileScreen ? (
          <AdminMobileScreen screen={mobileScreen} onBack={() => setMobileScreenId(null)} />
        ) : (
          <AdminMobileMenu onSelect={setMobileScreenId} />
        )}
      </div>

      <div className="hidden lg:block">
        <AdminNav active={tab} onSelect={setTab} />
      </div>
      <div className="hidden min-w-0 flex-1 flex-col lg:flex">
        <AdminHeader tab={tab} showRange={!NO_RANGE_TABS.has(tab)} />
        <TabBody />
      </div>
    </main>
  );
}
