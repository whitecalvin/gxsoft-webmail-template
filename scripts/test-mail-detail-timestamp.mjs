import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatFullMailTimestamp } from "../lib/format-date.ts";

const options = { locale: "ko", timeZone: "Asia/Seoul", hour12: false };
assert.match(formatFullMailTimestamp("2026-10-05T19:09:00Z", options), /2026.*10.*06.*04:09/u);
assert.match(formatFullMailTimestamp("2025-01-01T00:00:00Z", options), /2025.*01.*01.*09:00/u);
assert.match(formatFullMailTimestamp("2026-10-05T19:09:00Z", { ...options, locale: "en-US", hour12: true }), /04:09 AM/u);
assert.equal(formatFullMailTimestamp("invalid", options), "—");
const reading = readFileSync(new URL("../components/mail/ReadingPane.tsx", import.meta.url), "utf8");
assert.match(reading, /const formatMailTimestamp = useFullMailTimestamp\(\)/u);
assert.match(reading, /<time dateTime=\{email.receivedAt\}/u);
assert.match(reading, /sm:w-auto/u);
const shared = readFileSync(new URL("../components/mail/LiveSharedMailboxes.tsx", import.meta.url), "utf8");
assert.match(shared, /const formatTimestamp = useMailTimestamp\(\)/u);
assert.match(shared, /const formatDetailTimestamp = useFullMailTimestamp\(\)/u);
assert.match(shared, /<time dateTime=\{message.receivedAt\}>\{formatDetailTimestamp\(message.receivedAt\)\}/u);
console.log("mail detail timestamp: full dates, timezone, 12/24-hour format and personal/shared views passed");
