import CalendarPageClient from "@/components/calendar/CalendarPageClient";
import { loadInitialCalendar } from "@/lib/tastemail/workspace-initial";

export default async function CalendarPage() {
  return <CalendarPageClient initial={await loadInitialCalendar()} />;
}
