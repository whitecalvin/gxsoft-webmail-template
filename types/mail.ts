// Shared shapes for the mail feature (inbox, compose, meeting invites).
export type FolderId =
  | "inbox"
  | "starred"
  | "drafts"
  | "sent"
  | "archive"
  | "spam"
  | "trash"
  | "custom";

export interface Folder {
  id: FolderId;
}

export type RsvpChoice = "accept" | "tentative" | "decline";
export type AttendeeResponse = RsvpChoice | "noResponse";

export interface MeetingInvite {
  startsAt: string;
  endsAt: string;
  where: string;
  organizer: string;
  recurrence?: string;
  conflict?: string;
  attendees: {
    name: string;
    team: string;
    state: AttendeeResponse;
    isHost?: boolean;
  }[];
}

export interface Email {
  id: string;
  folder: FolderId;
  from: { name: string; email: string };
  replyTo?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  messageId?: string[];
  inReplyTo?: string[];
  references?: string[];
  subject: string;
  preview: string;
  body: string[];
  bodyText?: string;
  htmlBody?: string | null;
  blockedExternalImages?: boolean;
  receivedAt: string;
  unread: boolean;
  starred: boolean;
  attachments?: Array<{ blobId: string; name: string; type: string; size: number; disposition?: "attachment" | "inline"; cid?: string | null }>;
  invite?: MeetingInvite;
}

export interface ComposeDraft {
  fromAddress?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  inReplyTo?: string[];
  references?: string[];
  attachments?: Array<{ blobId: string; name: string; type: string; size: number }>;
  replyAll?: boolean;
  previousDraftId?: string;
}
