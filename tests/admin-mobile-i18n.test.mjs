import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { MOBILE_ADMIN_ROW_NUMBERS, MOBILE_ADMIN_SCREENS, formatAdminMobileDisplayValue, formatAdminMobileSubValues } from "../lib/mock-admin-mobile.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locales = ["ko", "en", "de", "es", "fr", "it", "ja", "pt", "zh", "zh-hant"];
const placeholders = (message) => [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

for (const locale of locales) {
  test(`admin mobile interpolation contract (${locale})`, () => {
    const messages = JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8")).adminMobile.screens;

    for (const screen of MOBILE_ADMIN_SCREENS) {
      const values = formatAdminMobileSubValues(screen, locale);
      assert.deepEqual(placeholders(messages[screen.id].sub), Object.keys(values).sort(), `${screen.id}.sub`);

      for (const row of screen.rows) {
        const key = `${screen.id}.${row.id}`;
        const translated = messages[screen.id].rows[row.id];
        for (const [field, numbers] of Object.entries(MOBILE_ADMIN_ROW_NUMBERS[screen.id]?.[row.id] ?? {})) {
          assert.deepEqual(placeholders(translated[field]), Object.keys(numbers).sort(), `${key}.${field}`);
        }
        if (row.metaCount !== undefined) assert.deepEqual(placeholders(translated.meta), ["count"], `${key}.meta`);
        if (row.line3UsageGb !== undefined) assert.deepEqual(placeholders(translated.line3), ["usage"], `${key}.line3`);
        if (row.line3StorageTb) assert.deepEqual(placeholders(translated.line3), ["total", "used"], `${key}.line3`);
      }
    }
  });
}

test("admin mobile mock time and calendar dates honor their display semantics", () => {
  const time = MOBILE_ADMIN_ROW_NUMBERS.security.phishing.line3.time;
  const invoiceDate = MOBILE_ADMIN_ROW_NUMBERS.billing.augustInvoice.line3.date;
  assert.equal(formatAdminMobileDisplayValue(time, "ko", "Asia/Seoul", false), "06:12");
  assert.equal(formatAdminMobileDisplayValue(time, "ko", "America/Los_Angeles", false), "14:12");
  assert.equal(formatAdminMobileDisplayValue(invoiceDate, "en", "Pacific/Kiritimati", false), "August 31");
  assert.equal(formatAdminMobileDisplayValue({ kind: "compact", value: 1680000 }, "ko", "Asia/Seoul", false), "168만");
  const backup = MOBILE_ADMIN_SCREENS.find((screen) => screen.id === "backup");
  const billing = MOBILE_ADMIN_SCREENS.find((screen) => screen.id === "billing");
  assert.equal(formatAdminMobileSubValues(backup, "ko", "Asia/Seoul", false).lastSuccess, "03:10");
  assert.equal(formatAdminMobileSubValues(backup, "ko", "America/Los_Angeles", false).lastSuccess, "11:10");
  assert.equal(formatAdminMobileSubValues(billing, "en", "Asia/Seoul", false).month, "September");
  assert.equal(formatAdminMobileSubValues(billing, "fr", "Asia/Seoul", false).amount, "3 852 000 ₩");
});
