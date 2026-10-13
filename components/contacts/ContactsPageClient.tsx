"use client";
import { LiveContacts } from "./LiveContacts";
import type { LiveContact } from "@/lib/tastemail/contacts";
export default function ContactsPageClient({ initialContacts }: { initialContacts?: LiveContact[] | null }) { return <LiveContacts initialContacts={initialContacts} />; }
