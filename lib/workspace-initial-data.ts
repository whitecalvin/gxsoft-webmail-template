import type { LiveCalendarEvent } from "./tastemail/calendar";

export type InitialCalendarData = { date: string; month: string; events: LiveCalendarEvent[]; username: string };

// 서버와 브라우저의 시간대가 달라도 같은 날짜·월로 초기 화면을 구성한다.
export function initialCalendarRange(now: Date) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const month = date.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  return { date, month, from: new Date(Date.UTC(year, monthNumber - 1, -14)).toISOString(), to: new Date(Date.UTC(year, monthNumber, 16)).toISOString() };
}
