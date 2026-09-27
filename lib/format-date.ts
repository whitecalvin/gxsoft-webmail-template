interface MailTimestampOptions {
  locale: string;
  timeZone: string;
  now: Date;
  yesterday: string;
  hour12: boolean;
}

function dayParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function dayKey({ year, month, day }: ReturnType<typeof dayParts>): string {
  return `${year}-${month}-${day}`;
}

// Compare calendar days in the selected time zone, rather than the server or
// browser's local zone. The caller supplies a shared render-time `now`.
export function formatMailTimestamp(iso: string, options: MailTimestampOptions): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const { locale, timeZone, now, yesterday, hour12 } = options;
  const currentParts = dayParts(now, timeZone);
  const currentDay = dayKey(currentParts);
  const messageDay = dayKey(dayParts(date, timeZone));

  if (messageDay === currentDay) {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: hour12 ? "h12" : "h23",
    }).format(date);
  }

  const previousDay = new Date(Date.UTC(currentParts.year, currentParts.month - 1, currentParts.day - 1));
  const previousDayKey = `${previousDay.getUTCFullYear()}-${previousDay.getUTCMonth() + 1}-${previousDay.getUTCDate()}`;
  if (messageDay === previousDayKey) {
    return yesterday;
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(date);
}
