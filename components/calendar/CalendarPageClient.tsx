"use client";
import { LiveCalendar } from "./LiveCalendar";
import type { InitialCalendarData } from "@/lib/workspace-initial-data";
export default function CalendarPageClient({ initial }: { initial?: InitialCalendarData | null }) { return <LiveCalendar initial={initial} />; }
