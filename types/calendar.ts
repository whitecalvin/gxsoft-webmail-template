// Shared shapes for the Calendar feature.
export type CalendarCategory =
  | "personal"
  | "team"
  | "executive"
  | "room"
  | "holiday";

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  startHour: number;
  endHour: number;
  title: string;
  meta: string;
  color: string;
  category: CalendarCategory;
}

export interface CalendarListEntry {
  key: CalendarCategory;
  color: string;
}

export interface MeetingRoom {
  id: "room5b" | "room3a" | "auditorium" | "focus";
  capacity: number;
  status: "available" | "busy" | "reserved";
}
