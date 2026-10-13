import MailboxesPageClient from "@/components/mail/MailboxesPageClient";
import { loadInitialSharedMailboxes } from "@/lib/tastemail/workspace-initial";

export default async function MailboxesPage() {
  return <MailboxesPageClient initialItems={await loadInitialSharedMailboxes()} />;
}
