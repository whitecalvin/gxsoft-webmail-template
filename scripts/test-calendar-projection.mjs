import assert from "node:assert/strict";
import test from "node:test";
import { allDayDateRange, allDayUtcRange, editedAllDayEventTiming, projectLiveCalendarEvents } from "../lib/calendar-projection.ts";

const windowStart = new Date(2026, 8, 10);
const windowEnd = new Date(2026, 8, 14);
const base = { id: "sample", title: "Sample", location: "", status: "confirmed", timezone: "Asia/Seoul" };
const timed = (start, end, extra = {}) => ({
  ...base, allDay: false, startsAt: start.toISOString(), endsAt: end.toISOString(), ...extra,
});

test("an event crossing midnight appears on both days with clipped hours", () => {
  const event = timed(new Date(2026, 8, 10, 19), new Date(2026, 8, 11, 11));
  const result = projectLiveCalendarEvents([event], windowStart, windowEnd);
  assert.deepEqual(result.month.map((item) => item.date), ["2026-09-10", "2026-09-11"]);
  assert.deepEqual(result.timed.map(({ date, startHour, endHour }) => [date, startHour, endHour]), [
    ["2026-09-10", 19, 20], ["2026-09-11", 9, 11],
  ]);
});

test("an event ending exactly at midnight does not occupy the next day", () => {
  const event = timed(new Date(2026, 8, 10, 18), new Date(2026, 8, 11));
  const result = projectLiveCalendarEvents([event], windowStart, windowEnd);
  assert.deepEqual(result.month.map((item) => item.date), ["2026-09-10"]);
});

test("all-day events occupy an exclusive date range and a separate row", () => {
  const event = {
    ...base, allDay: true, startsAt: "2026-09-09T15:00:00Z", endsAt: "2026-09-11T15:00:00Z",
  };
  const result = projectLiveCalendarEvents([event], windowStart, windowEnd);
  assert.deepEqual(result.month.map((item) => item.date), ["2026-09-10", "2026-09-11"]);
  assert.deepEqual(result.allDay.map((item) => item.date), ["2026-09-10", "2026-09-11"]);
  assert.equal(result.timed.length, 0);
});

test("all-day dates follow the event timezone, not the UTC date", () => {
  const event = { startsAt: "2026-09-11T04:00:00Z", endsAt: "2026-09-12T04:00:00Z", timezone: "America/New_York" };
  assert.deepEqual(allDayDateRange(event), { first: "2026-09-11", last: "2026-09-11" });
  const result = projectLiveCalendarEvents([{ ...base, ...event, allDay: true }], windowStart, windowEnd);
  assert.deepEqual(result.allDay.map((item) => item.date), ["2026-09-11"]);
});

test("all-day form dates become local midnights with an exclusive end", () => {
  assert.deepEqual(allDayUtcRange("2026-09-10", "2026-09-10"), {
    startsAt: new Date(2026, 8, 10).toISOString(),
    endsAt: new Date(2026, 8, 11).toISOString(),
  });
  assert.deepEqual(allDayUtcRange("2026-09-10", "2026-09-11"), {
    startsAt: new Date(2026, 8, 10).toISOString(),
    endsAt: new Date(2026, 8, 12).toISOString(),
  });
  assert.equal(allDayUtcRange("2026-09-11", "2026-09-10"), null);
  assert.equal(allDayUtcRange("2026-02-30", "2026-03-01"), null);
});

test("unchanged all-day dates retain the server instants and event timezone", () => {
  const original = { startsAt: "2026-09-11T04:00:00Z", endsAt: "2026-09-12T04:00:00Z", timezone: "America/New_York" };
  assert.deepEqual(editedAllDayEventTiming(original, "2026-09-11", "2026-09-11", "Asia/Seoul"), original);
});

test("changed all-day dates use viewer-local exclusive dates and timezone", () => {
  const original = { startsAt: "2026-09-11T04:00:00Z", endsAt: "2026-09-12T04:00:00Z", timezone: "America/New_York" };
  assert.deepEqual(editedAllDayEventTiming(original, "2026-09-12", "2026-09-13", "Asia/Seoul"), {
    ...allDayUtcRange("2026-09-12", "2026-09-13"), timezone: "Asia/Seoul",
  });
  assert.equal(editedAllDayEventTiming(original, "2026-09-13", "2026-09-12", "Asia/Seoul"), null);
});

test("long and cancelled events do not create hidden or stale grid items", () => {
  const event = timed(new Date(2026, 0, 1), new Date(2026, 11, 31));
  const cancelled = timed(new Date(2026, 8, 10, 10), new Date(2026, 8, 10, 11), {
    id: "cancelled", status: "cancelled",
  });
  const result = projectLiveCalendarEvents([event, cancelled], windowStart, windowEnd);
  assert.deepEqual(result.month.map((item) => item.date), [
    "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13",
  ]);
  assert.equal(result.allDay.length, 0);
  assert.equal(result.timed.length, 4);
});
