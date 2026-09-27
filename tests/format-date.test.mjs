import test from "node:test";
import assert from "node:assert/strict";
import { formatMailTimestamp } from "../lib/format-date.ts";

const options = {
  locale: "en",
  timeZone: "Asia/Seoul",
  now: new Date("2026-09-26T15:30:00.000Z"),
  yesterday: "Yesterday",
  hour12: false,
};

test("mail timestamps use the configured time zone and hour cycle", () => {
  assert.equal(formatMailTimestamp("2026-09-26T15:15:00.000Z", options), "00:15");
  assert.equal(formatMailTimestamp("2026-09-26T15:15:00.000Z", { ...options, hour12: true }), "12:15 AM");
  assert.equal(formatMailTimestamp("2026-09-26T15:15:00.000Z", { ...options, timeZone: "UTC" }), "15:15");
});

test("mail timestamps use translated yesterday and localized older dates", () => {
  assert.equal(formatMailTimestamp("2026-09-25T15:15:00.000Z", options), "Yesterday");
  assert.equal(formatMailTimestamp("2026-09-07T04:00:00.000Z", options), "Sep 7");
  assert.equal(formatMailTimestamp("2026-09-07T04:00:00.000Z", { ...options, locale: "ko" }), "9월 7일");
});

test("yesterday is a calendar day even across a daylight-saving transition", () => {
  const newYork = { ...options, timeZone: "America/New_York", now: new Date("2026-11-02T04:30:00.000Z") };
  assert.equal(formatMailTimestamp("2026-11-01T03:30:00.000Z", newYork), "Yesterday");
});

test("invalid timestamps do not throw", () => {
  assert.equal(formatMailTimestamp("not-a-date", options), "—");
});
