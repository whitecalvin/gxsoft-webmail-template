import assert from "node:assert/strict";
import test from "node:test";
import { editedEventTimezone } from "../lib/calendar-edit.ts";

test("title-only edits preserve the event's original timezone", () => {
  assert.equal(editedEventTimezone(
    "America/New_York", "2026-09-08T09:00", "2026-09-08T10:00",
    "2026-09-08T09:00", "2026-09-08T10:00", "Asia/Seoul",
  ), "America/New_York");
});

test("editing displayed wall time uses the viewer's timezone", () => {
  assert.equal(editedEventTimezone(
    "America/New_York", "2026-09-08T09:00", "2026-09-08T10:00",
    "2026-09-08T09:30", "2026-09-08T10:00", "Asia/Seoul",
  ), "Asia/Seoul");
  assert.equal(editedEventTimezone(
    "America/New_York", "2026-09-08T09:00", "2026-09-08T10:00",
    "2026-09-08T09:00", "2026-09-08T10:30", "Asia/Seoul",
  ), "Asia/Seoul");
});
