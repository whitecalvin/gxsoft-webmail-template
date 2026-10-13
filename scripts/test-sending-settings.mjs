import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const exports = {};
new Function("exports", ts.transpileModule(readFileSync("lib/sending-settings.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { validDefaultRecipients, sendingComposeDefaults, replyQuote } = exports;
assert.equal(validDefaultRecipients("a@example.com; b@example.com"), true);
for (const input of ["a@example.com,", "a@example.com\r\nBcc:x@example.com", "<a@example.com>", "a@", "a@@example.com"]) assert.equal(validDefaultRecipients(input), false);
const initial = { to: "", subject: "", body: "" };
const prefs = { defaultCc: "a@example.com; b@example.com", defaultBcc: "private@example.com", composeMode: "plain" };
assert.deepEqual(sendingComposeDefaults(initial, prefs, false), { cc: "a@example.com, b@example.com", bcc: "private@example.com", mode: "plain" });
assert.equal(sendingComposeDefaults(initial, prefs, true).bcc, "");
for (const patch of [{ to: "reply@example.com" }, { subject: "FWD: mail" }, { body: "forwarded" }, { previousDraftId: "draft" }, { attachments: [{}] }, { inReplyTo: ["message"] }]) {
  assert.equal(sendingComposeDefaults({ ...initial, ...patch }, prefs, false).cc, "");
  assert.equal(sendingComposeDefaults({ ...initial, ...patch }, prefs, false).bcc, "");
}
assert.equal(sendingComposeDefaults({ ...initial, cc: "chosen@example.com", htmlBody: "<b>keep</b>" }, prefs, false).cc, "chosen@example.com");
assert.equal(sendingComposeDefaults({ ...initial, htmlBody: "<b>keep</b>" }, prefs, false).mode, "rich");
assert.equal(replyQuote("original", "none"), "");
assert.equal(replyQuote("one\ntwo", "inline"), "\n\n> one\n> two");
assert.equal(replyQuote("one\ntwo", "below"), "\n\none\ntwo");
for (const file of ["ko", "en"]) {
  const m = JSON.parse(readFileSync(`messages/${file}.json`, "utf8"));
  for (const field of ["defaultReply", "quoteStyle", "composeMode", "defaultCc", "defaultBcc"]) assert.ok(m.settingsSystem.fields[field]);
}
console.log("PASS: sending defaults, recipient validation, shared/reply/forward/draft isolation, HTML preservation and quote styles");
