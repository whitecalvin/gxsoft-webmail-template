// Step content for the first-run product tour overlay (components/tour).
export interface TourStep {
  id: "compose" | "search" | "theme" | "tools" | "quarantine" | "ready";
}

export const TOUR_STEPS: TourStep[] = [
  { id: "compose" },
  { id: "search" },
  { id: "theme" },
  { id: "tools" },
  { id: "quarantine" },
  { id: "ready" },
];

export interface ChecklistItem {
  id: "avatar" | "signature" | "twoFactor" | "mobileApp" | "importMail";
  done: boolean;
  minutes?: number;
}

export const TOUR_CHECKLIST: ChecklistItem[] = [
  { id: "avatar", done: true },
  { id: "signature", done: true },
  { id: "twoFactor", done: false, minutes: 2 },
  { id: "mobileApp", done: false, minutes: 1 },
  { id: "importMail", done: false, minutes: 5 },
];
