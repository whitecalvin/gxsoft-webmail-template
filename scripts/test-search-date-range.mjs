import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { searchDateRange } from "../lib/search-date-range.ts";
import { formatFullMailTimestamp } from "../lib/format-date.ts";

assert.deepEqual(searchDateRange("2026-10-06", "2026-10-06", "Asia/Seoul"), {
  after: "2026-10-05T14:59:59.999Z", before: "2026-10-06T15:00:00.000Z", invalid: false,
});
for (const [day, hours] of [["2026-03-08", 23], ["2026-11-01", 25]]) {
  const range = searchDateRange(day, day, "America/New_York");
  assert.equal(range.invalid, false);
  assert.equal(Date.parse(range.before) - Date.parse(range.after) - 1, hours * 3_600_000);
}
assert.equal(searchDateRange("2026-10-07", "2026-10-06", "Asia/Seoul").invalid, true);
assert.equal(searchDateRange("2026-02-30", "", "UTC").invalid, true);
assert.equal(searchDateRange("2011-12-30", "", "Pacific/Apia").invalid, true);
assert.equal(searchDateRange("", "2026-10-06", "UTC").before, "2026-10-07T00:00:00.000Z");
assert.equal(searchDateRange("2026-10-06", "", "UTC").before, undefined);
assert.equal(searchDateRange("", "", "UTC").invalid, false);
const options = { locale: "ko", timeZone: "Asia/Seoul", hour12: false };
assert.match(formatFullMailTimestamp("2026-10-05T19:09:00Z", options), /2026.*10.*06.*04:09/u);
assert.equal(formatFullMailTimestamp("bad", options), "—");

const source = readFileSync(new URL("../app/api/mail/search/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
let calls = 0;
let received;
new Function("exports", "require", code)(exports, name => {
  if (name === "next/server") return { NextResponse: { json: (data, init) => ({ data, ...init }) } };
  if (name.endsWith("/server")) return { assertLiveApiConfigured() {} };
  if (name.endsWith("/session")) return { tastemailSessionToken: async () => "synthetic" };
  if (name.endsWith("/mail")) return {
    loadLiveMailSearch: async (_token, _query, _position, options) => { calls++; received = options; return {}; },
    InvalidSearchFilterError: class extends Error {}, MailServiceError: class extends Error {},
  };
  throw new Error(name);
});
for (const params of ["before=bad", "before=2026-02-30T00:00:00.000Z", "after=2026-10-07T00:00:00.000Z&before=2026-10-06T00:00:00.000Z", "after=2026-10-06T00:00:00.000Z&before=2026-10-06T00:00:00.000Z"]) {
  assert.equal((await exports.GET(new Request(`http://localhost/api/mail/search?q=test&${params}`))).status, 400);
}
assert.equal(calls, 0);
const range = searchDateRange("2026-10-06", "2026-10-06", "Asia/Seoul");
assert.equal((await exports.GET(new Request(`http://localhost/api/mail/search?q=test&${new URLSearchParams({ after: range.after, before: range.before })}`))).status, 200);
assert.equal(received.after, range.after);
assert.equal(received.before, range.before);
const adapter = readFileSync(new URL("../lib/tastemail/mail.ts", import.meta.url), "utf8");
assert.match(adapter, /if \(options\.before\) conditions\.push\(\{ before: options\.before \}\)/);
console.log("search dates: full timestamp, inclusive bounds, saved timezone, DST, invalid periods and API propagation passed");
