export type NotificationMode = "instant" | "digest" | "off";
export type FilterField = "from" | "to" | "subject" | "body" | "attachment" | "size";
export type FilterAction = "move" | "label" | "star" | "read" | "forward" | "delete";
export type IntegrationId = "calendar" | "approval" | "slack" | "drive";

export interface SignatureSetting {
  id: string;
  name: string;
  content: string;
  html?: string;
}

export interface LabelSetting {
  id: string;
  name: string;
  color: string;
  count: number;
  visible: boolean;
}

export interface FilterSetting {
  id: string;
  name: string;
  enabled: boolean;
  field: FilterField;
  value: string;
  action: FilterAction;
  actionValue: string;
}

export interface UserSettings {
  version: 1;
  locale: { timezone: string; dateFormat: "locale" | "iso" | "long"; timeFormat: "12" | "24"; weekStart: "sunday" | "monday" };
  accessibility: { fontScale: "90" | "100" | "110" | "125"; highContrast: boolean; reduceMotion: boolean; enhancedFocus: boolean; screenReaderDetails: boolean; keyboardNavigation: boolean };
  compose: { senderName: string; senderAddress: string; font: string; defaultSignatureId: string; signatureOnNew: boolean; signatureOnReply: boolean; undoSeconds: "0" | "5" | "10" | "20" | "30"; signatures: SignatureSetting[] };
  inbox: { hiddenSystemMailboxes: string[]; hiddenMailboxIds: string[]; showMailboxCounts: boolean; showMailboxStorage: boolean; showDeliveryDetails: boolean; density: "comfortable" | "compact"; previewPane: "right" | "bottom" | "off"; conversationView: boolean; markRead: "immediate" | "2seconds" | "manual"; remoteImages: "always" | "contacts" | "never"; remoteImageSenders: Record<string, string[]>; pageSize: "25" | "50" | "100"; dateFormat: "relative" | "short" | "full"; unreadStyle: "bold" | "highlight" | "dot" };
  sending: { defaultReply: "reply" | "replyAll"; quoteStyle: "inline" | "below" | "none"; requestReceipt: boolean; scheduleDefault: "off" | "nextMorning" | "custom"; autosaveSeconds: "15" | "30" | "60"; defaultCc: string; defaultBcc: string; composeMode: "html" | "plain" };
  away: { enabled: boolean; startDate: string; endDate: string; subject: string; internalMessage: string; externalMessage: string; contactsOnly: boolean };
  notifications: { browser: boolean; email: boolean; sound: boolean; weekends: boolean; quietStart: string; quietEnd: string; modes: Record<"important" | "general" | "approval" | "mention" | "shared", NotificationMode> };
  labels: LabelSetting[];
  filters: FilterSetting[];
  blockedSenders: { id: string; value: string; type: "email" | "domain" }[];
  account: { displayName: string; primaryEmail: string; replyTo: string; aliases: string[] };
  security: {
    twoFactor: boolean;
    backupCodes: number;
    passwordChangedAt: string;
    sessions: { id: string; device: string; location: string; current: boolean; lastActive: string }[];
  };
  integrations: { id: IntegrationId; connected: boolean; autoSync: boolean; lastSync: string; status: "ok" | "error" }[];
  shortcuts: { enabled: boolean; bindings: Record<string, string> };
}
