import type {
  CalendarEvent,
  CalendarListEntry,
  MeetingRoom,
} from "@/types/calendar";
import { toDateKey } from "@/lib/date-utils";

// Mock data and helpers for the Calendar page: the list of calendars a user
// can toggle, meeting rooms, and a generator for a week's worth of events.
export const CALENDAR_LIST: CalendarListEntry[] = [
  { key: "personal", color: "var(--color-primary-solid)" },
  { key: "team", color: "#267849" },
  { key: "executive", color: "#6b5ca8" },
  { key: "room", color: "#8b5d1e" },
  { key: "holiday", color: "#c0433b" },
];

export const MEETING_ROOMS: MeetingRoom[] = [
  {
    id: "room5b",
    capacity: 12,
    status: "available",
  },
  {
    id: "room3a",
    capacity: 6,
    status: "busy",
  },
  {
    id: "auditorium",
    capacity: 40,
    status: "reserved",
  },
  {
    id: "focus",
    capacity: 2,
    status: "available",
  },
];

// Returns the Monday (00:00) of the week containing `date`, so the week grid
// always starts on a Monday regardless of the browser's locale.
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday-start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Generates a fixed set of demo events anchored to the given week, so every
// week viewed shows the same events shifted to that week's dates.
export function getMockEvents(weekStart: Date): CalendarEvent[] {
  const dateAt = (offsetDays: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offsetDays);
    return toDateKey(d);
  };

  return [
    {
      id: "ev-1",
      date: dateAt(0),
      startHour: 9.5,
      endHour: 10,
      title: "주간 팀 스탠드업",
      meta: "전략기획팀 · 회의실 3A",
      color: "#267849",
      category: "team",
    },
    {
      id: "ev-2",
      date: dateAt(0),
      startHour: 14,
      endHour: 14.5,
      title: "1:1 이수민",
      meta: "온라인 · Meet",
      color: "var(--color-primary-solid)",
      category: "personal",
    },
    {
      id: "ev-3",
      date: dateAt(1),
      startHour: 10,
      endHour: 11.5,
      title: "예산 리뷰",
      meta: "재무팀 합동",
      color: "#6b5ca8",
      category: "executive",
    },
    {
      id: "ev-4",
      date: dateAt(2),
      startHour: 11,
      endHour: 12,
      title: "인프라 증설 사전 검토",
      meta: "박서준 · 회의실 5B",
      color: "#8b5d1e",
      category: "room",
    },
    {
      id: "ev-5",
      date: dateAt(2),
      startHour: 12.5,
      endHour: 13.5,
      title: "점심 · 부서 회식",
      meta: "1층 로비 집결",
      color: "var(--color-primary-solid)",
      category: "personal",
    },
    {
      id: "ev-6",
      date: dateAt(3),
      startHour: 15,
      endHour: 16,
      title: "채용 면접 (백엔드)",
      meta: "인사팀 동석 · 화상",
      color: "#267849",
      category: "team",
    },
    {
      id: "ev-7",
      date: dateAt(4),
      startHour: 10,
      endHour: 11,
      title: "파트너 미팅",
      meta: "광주 총판 · 외부",
      color: "#8b5d1e",
      category: "room",
    },
    {
      id: "ev-8",
      date: dateAt(4),
      startHour: 17,
      endHour: 18,
      title: "주간 마감 정리",
      meta: "개인 시간",
      color: "var(--color-primary-solid)",
      category: "personal",
    },
  ];
}

export const AI_DETECTED_EVENT = {
  title: "인프라 증설 검토 회의",
  personName: "박서준",
  summary:
    "'인프라 증설 검토 회의' — 박서준님 메일에서 회의 일정을 찾았습니다.",
  startHour: 15,
  endHour: 16,
  dayOffset: 4,
  meta: "CTO 승인 안건 · 회의실 5B",
  color: "#6b5ca8",
  category: "executive" as const,
};

export const CALENDAR_HOURS = Array.from({ length: 11 }, (_, i) => i + 9);
