import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mailboxLabel } from "../lib/mailbox-label.ts";

for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
  const { sidebar } = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const translate = (role) => sidebar[role];
  for (const role of ["inbox", "drafts", "sent", "archive", "spam", "trash"]) {
    assert.equal(typeof sidebar[role], "string");
    assert.ok(sidebar[role].length > 0);
    assert.equal(mailboxLabel(role, "Server name", translate), sidebar[role]);
  }
  assert.equal(mailboxLabel("junk", "Junk", translate), sidebar.spam);
  assert.equal(mailboxLabel(null, "Custom folder", translate), "Custom folder");
  assert.equal(mailboxLabel("unknown", "Server custom folder", translate), "Server custom folder");
}
console.log("Mailbox labels: six system roles, junk alias and custom names checked in ten locales.");
