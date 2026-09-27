// Operators implemented against the local mock result sample.
export const SYN_PEOPLE = [
  { op: "from:박서준", id: "fromSender" },
  { op: "in:inbox", id: "inFolder" },
];

export const SYN_CONTENT = [
  { op: "subject:예산", id: "subject" },
  { op: '"인프라 예산"', id: "exactPhrase" },
  { op: "has:attachment", id: "hasAttachment" },
  { op: "filename:pdf", id: "filename" },
];

export const SYNTAX_RULES = [
  "allTerms",
  "quotedPhrase",
  "unsupportedOperator",
];

export const SYNTAX_RECIPES = [
  { q: "from:박서준 has:attachment", id: "senderAttachments" },
  { q: "in:inbox 예산", id: "inboxBudget" },
  { q: "filename:pdf", id: "pdfFiles" },
];
