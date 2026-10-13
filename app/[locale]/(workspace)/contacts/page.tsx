import ContactsPageClient from "@/components/contacts/ContactsPageClient";
import { loadInitialContacts } from "@/lib/tastemail/workspace-initial";

export default async function ContactsPage() {
  return <ContactsPageClient initialContacts={await loadInitialContacts()} />;
}
