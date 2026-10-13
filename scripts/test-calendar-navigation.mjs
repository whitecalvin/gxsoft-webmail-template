import assert from "node:assert/strict";
import { shiftCalendarAnchor } from "../lib/calendar-navigation.ts";

const dateKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");

assert.equal(dateKey(shiftCalendarAnchor(new Date(2026, 0, 31), "month", 1)), "2026-02-28");
assert.equal(dateKey(shiftCalendarAnchor(new Date(2024, 0, 31), "month", 1)), "2024-02-29");
assert.equal(dateKey(shiftCalendarAnchor(new Date(2026, 2, 31), "month", -1)), "2026-02-28");
assert.equal(dateKey(shiftCalendarAnchor(new Date(2026, 11, 31), "month", 1)), "2027-01-31");
assert.equal(dateKey(shiftCalendarAnchor(new Date(2026, 8, 27), "week", 1)), "2026-10-04");
assert.equal(dateKey(shiftCalendarAnchor(new Date(2026, 11, 31), "day", 1)), "2027-01-01");

process.stdout.write("Calendar navigation boundaries passed.\n");
