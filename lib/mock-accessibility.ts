// Mock data for the Accessibility (KWCAG 2.2) compliance page.
export const A11Y_ROWS = [
  { id: "keyboard", criterion: "2.1.1", state: "pass" },
  { id: "focus", criterion: "2.4.7", state: "pass" },
  { id: "contrast", criterion: "1.4.3", state: "pass" },
  { id: "color", criterion: "1.4.1", state: "pass" },
  { id: "altText", criterion: "1.1.1", state: "pass" },
  { id: "tableHeaders", criterion: "1.3.1", state: "pass" },
  { id: "errors", criterion: "3.3.1", state: "pass" },
  { id: "zoom", criterion: "1.4.4", state: "inProgress" },
  { id: "timing", criterion: "2.2.1", state: "inProgress" },
];

export const CONTRAST_ROWS = [
  { id: "body", ratio: "15.9:1", state: "AAA", fg: "#17181B" },
  { id: "secondary", ratio: "5.1:1", state: "AA", fg: "#6B6F77" },
  { id: "accent", ratio: "6.4:1", state: "AA", fg: "#2B4BF2" },
  { id: "muted", ratio: "2.6:1", state: "largeOnly", fg: "#9A9EA5", fail: true },
];
