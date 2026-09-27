// Shared shapes for the mail feature (inbox, compose, meeting invites).
export type FolderId =
  | "inbox"
  | "starred"
  | "drafts"
  | "sent"
  | "archive"
  | "spam"
  | "trash";

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
  to: string[];
  cc?: string[];
  subject: string;
  preview: string;
  body: string[];
  receivedAt: string;
  unread: boolean;
  starred: boolean;
  invite?: MeetingInvite;
}

export interface ComposeDraft {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}
