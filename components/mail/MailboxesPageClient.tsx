"use client";
import { LiveSharedMailboxes } from "./LiveSharedMailboxes";
import type { LiveSharedMailbox } from "@/lib/tastemail/shared-mailboxes";
export default function MailboxesPageClient({ initialItems }: { initialItems?: LiveSharedMailbox[] | null }) { return <LiveSharedMailboxes initialItems={initialItems} />; }
