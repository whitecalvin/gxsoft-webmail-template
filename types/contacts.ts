// Shared shapes for the Contacts / Org Chart feature.
export type ContactGroup = "external" | "purchasing" | "advisor" | "personal";
export type ContactFilter = "all" | "starred" | "external" | "purchasing";

export interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  mobile: string;
  memo: string;
  group: ContactGroup;
  initials: string;
  bg: string;
  fg: string;
  starred: boolean;
}

export interface OrgNode {
  id: string;
  name: string;
  count: number;
  depth: number;
  parentId: string | null;
}

export interface OrgMember {
  id: string;
  teamId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  mobile: string;
  joined: string;
  approvalLine: "directorCeo" | "leadDirector";
  initials: string;
  bg: string;
  fg: string;
  presence: "working" | "away" | "offline";
}

export interface PersonMail {
  subject: string;
  date: string; // ISO calendar date
}
