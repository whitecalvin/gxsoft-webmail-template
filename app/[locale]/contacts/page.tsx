"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { OrgTreeSidebar } from "@/components/contacts/OrgTreeSidebar";
import { MyContactsView } from "@/components/contacts/MyContactsView";
import { OrgTeamView } from "@/components/contacts/OrgTeamView";
import { ContactsMobileView } from "@/components/contacts/ContactsMobileView";
import { LiveContacts } from "@/components/contacts/LiveContacts";
import { useMail } from "@/context/mail-context";
import type { ContactFilter } from "@/types/contacts";

// Contacts hub: switches the right pane between "my contacts" and the org
// chart drill-down based on what's selected in OrgTreeSidebar.
type ContactMode = "my" | "org";

export default function ContactsPage() {
  const { mode } = useMail();
  return mode === "live" ? <LiveContacts /> : <MockContactsPage />;
}

function MockContactsPage() {
  const t = useTranslations("contactsPage");
  const [mode, setMode] = useState<ContactMode>("my");
  const [myGroupFilter, setMyGroupFilter] = useState<ContactFilter>("all");
  const [selectedTeamId, setSelectedTeamId] = useState("org-strategy");

  return (
    <WorkspaceLayout title={t("title")} showGlobalSearch={false} className="flex flex-col lg:flex-row">
      <div className="min-h-0 flex-1 lg:hidden">
        <ContactsMobileView />
      </div>
      <div className="hidden lg:block">
        <OrgTreeSidebar
          mode={mode}
          selectedTeamId={selectedTeamId}
          onSelectTeam={(teamId) => {
            setSelectedTeamId(teamId);
            setMode("org");
          }}
          myGroupFilter={myGroupFilter}
          onSelectOrg={() => setMode("org")}
          onSelectMy={() => { setMyGroupFilter("all"); setMode("my"); }}
          onSelectPartners={() => { setMyGroupFilter("external"); setMode("my"); }}
        />
      </div>
      <div className="hidden min-w-0 flex-1 lg:flex">
        {mode === "my" ? (
          <MyContactsView activeGroupFilter={myGroupFilter} onGroupFilterChange={setMyGroupFilter} />
        ) : (
          <OrgTeamView teamId={selectedTeamId} />
        )}
      </div>
    </WorkspaceLayout>
  );
}
