// Types and mock data for the notification bell popover in the top bar.
export type NotificationKind = "approval" | "mention" | "mail" | "system";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  unread: boolean;
  avatarBg: string;
  avatarFg: string;
}

export const NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    kind: "approval",
    unread: true,
    avatarBg: "#ECEFFE",
    avatarFg: "#2B4BF2",
  },
  {
    id: "n2",
    kind: "mention",
    unread: true,
    avatarBg: "#EDEBF7",
    avatarFg: "#6B5CA8",
  },
  {
    id: "n3",
    kind: "approval",
    unread: true,
    avatarBg: "#ECEFFE",
    avatarFg: "#2B4BF2",
  },
  {
    id: "n4",
    kind: "mail",
    unread: false,
    avatarBg: "#F0F0EC",
    avatarFg: "#5C6068",
  },
  {
    id: "n5",
    kind: "system",
    unread: false,
    avatarBg: "#FDF0E4",
    avatarFg: "#B4740F",
  },
  {
    id: "n6",
    kind: "mention",
    unread: false,
    avatarBg: "#EDEBF7",
    avatarFg: "#6B5CA8",
  },
];
