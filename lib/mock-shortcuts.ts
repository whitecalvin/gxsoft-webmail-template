// Keyboard shortcut reference data shown on the Shortcuts help page.
export interface ShortcutGroup {
  id: string;
  items: { id: string; keys: string[] }[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: "navigation",
    items: [
      { id: "inbox", keys: ["G", "I"] },
      { id: "sent", keys: ["G", "T"] },
      { id: "drafts", keys: ["G", "D"] },
      { id: "pendingApprovals", keys: ["G", "A"] },
      { id: "calendar", keys: ["G", "C"] },
      { id: "contacts", keys: ["G", "P"] },
    ],
  },
  {
    id: "global",
    items: [
      { id: "commandSearch", keys: ["⌘", "K"] },
      { id: "compose", keys: ["C"] },
      { id: "notifications", keys: ["⌘", "⇧", "N"] },
      { id: "shortcutHelp", keys: ["?"] },
      { id: "settings", keys: ["⌘", ","] },
      { id: "collapseSidebar", keys: ["⌘", "\\"] },
    ],
  },
  {
    id: "list",
    items: [
      { id: "nextPrevious", keys: ["J", "K"] },
      { id: "open", keys: ["↵"] },
      { id: "select", keys: ["X"] },
      { id: "selectAll", keys: ["⌘", "A"] },
      { id: "toggleRead", keys: ["⇧", "U"] },
      { id: "star", keys: ["S"] },
    ],
  },
  {
    id: "mail",
    items: [
      { id: "archive", keys: ["E"] },
      { id: "delete", keys: ["#"] },
      { id: "reportSpam", keys: ["!"] },
      { id: "snooze", keys: ["H"] },
      { id: "addLabel", keys: ["L"] },
      { id: "moveToFolder", keys: ["V"] },
    ],
  },
  {
    id: "compose",
    items: [
      { id: "send", keys: ["⌘", "↵"] },
      { id: "saveDraft", keys: ["⌘", "S"] },
      { id: "scheduleSend", keys: ["⌘", "⇧", "↵"] },
      { id: "attachFile", keys: ["⌘", "⇧", "A"] },
      { id: "addRecipient", keys: ["⌘", "⇧", "T"] },
      { id: "closeWindow", keys: ["Esc"] },
    ],
  },
  {
    id: "reply",
    items: [
      { id: "reply", keys: ["R"] },
      { id: "replyAll", keys: ["A"] },
      { id: "forward", keys: ["F"] },
      { id: "collapseQuote", keys: ["⇧", "Q"] },
      { id: "viewOriginal", keys: ["⇧", "O"] },
    ],
  },
  {
    id: "search",
    items: [
      { id: "openSearch", keys: ["/"] },
      { id: "syntaxHelp", keys: ["?"] },
      { id: "searchWithinResults", keys: ["⌘", "F"] },
      { id: "resetFilters", keys: ["⇧", "Esc"] },
    ],
  },
  {
    id: "admin",
    items: [
      { id: "switchTab", keys: ["⌥", "1–9"] },
      { id: "searchTable", keys: ["⌘", "F"] },
      { id: "exportSelected", keys: ["⌘", "E"] },
      { id: "refresh", keys: ["⌘", "R"] },
    ],
  },
];
