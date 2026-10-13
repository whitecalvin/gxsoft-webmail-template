import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as messageValidators from "../lib/tastemail/search-page.ts";
import { clientMailFailure } from "../lib/tastemail/client-session-status.ts";

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const compiledModule = { exports: {} };
const sourceText = readFileSync(new URL("../lib/tastemail/mail-page.ts", import.meta.url), "utf8");
new Function("require", "exports", ts.transpileModule(sourceText, { compilerOptions }).outputText)(
  name => { assert.equal(name, "./search-page"); return messageValidators; }, compiledModule.exports);
const { requireLiveMailPage, requireLiveMailboxSummary } = compiledModule.exports;
const mailbox = { id: "inbox", name: "Inbox", role: "inbox", totalEmails: 1, unreadEmails: 0, usedBytes: 1024, quotaBytes: null };
const message = { id: "synthetic", folder: "inbox", from: { name: "Synthetic", email: "test@example.invalid" },
  to: [], subject: "Test", preview: "Test", body: [], receivedAt: "2026-10-04T00:00:00Z", unread: false, starred: false, detailLoaded: false };
const page = { accountId: "test-account", username: "test@example.invalid", mailboxId: "inbox", mailboxes: [mailbox],
  position: 0, total: 1, limit: 50, messages: [message] };
assert.equal(requireLiveMailPage(page), page);
assert.doesNotThrow(() => requireLiveMailboxSummary({ ...page, allCounts: { total: 100, unread: 30 } }));
for (const allCounts of [null, { total: -1, unread: 0 }, { total: 1, unread: 2 }, { total: 10, unread: "3" }]) {
  assert.throws(() => requireLiveMailboxSummary({ ...page, allCounts }), /unavailable/);
}
assert.equal(requireLiveMailPage(page, "test-account"), page);
assert.throws(() => requireLiveMailPage(page, "other-account"), /unavailable/);
assert.doesNotThrow(() => requireLiveMailPage({ ...page, position: 100, total: 0, messages: [] }));
assert.doesNotThrow(() => requireLiveMailPage({ ...page, messages: [{ ...message, detailLoaded: true, htmlBody: "<p>Test</p>", attachments: [] }] }));
for (const change of [{ accountId: "" }, { username: null }, { mailboxId: [] }, { position: -1 }, { total: 0.5 },
  { limit: 0 }, { messages: null }, { messages: [message, message] }, { mailboxes: null }, { mailboxes: [mailbox, mailbox] }]) {
  assert.throws(() => requireLiveMailPage({ ...page, ...change }), /unavailable/);
}
for (const change of [{ usedBytes: -1 }, { quotaBytes: {} }, { id: "" }, { name: null }, { role: false },
  { totalEmails: NaN }, { unreadEmails: "1" }]) {
  assert.throws(() => requireLiveMailboxSummary({ ...page, mailboxes: [{ ...mailbox, ...change }] }), /unavailable/);
}
for (const change of [{ body: null }, { from: null }, { unread: "false" }, { detailLoaded: undefined }, { attachments: [{}] }]) {
  assert.throws(() => requireLiveMailPage({ ...page, messages: [{ ...message, ...change }] }), /unavailable/);
}

// Verify both actual list callbacks and the personal usage refresh callback.
for (const path of ["context/mail-context.tsx", "components/mail/LiveSharedMailboxes.tsx"]) {
  const source = ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "then" &&
        ts.isArrowFunction(node.arguments[0]) && /requireLiveMail(Page|boxSummary)\(/.test(node.arguments[0].getText(source))) callbacks.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(callbacks.length, path.startsWith("context") ? 2 : 1);
  for (const callback of callbacks) {
    const js = ts.transpileModule(`const handler = ${callback.getText(source)};`, { compilerOptions }).outputText;
    const parse = new Function("requireLiveMailPage", "requireLiveMailboxSummary", "clientMailFailure", "selected", `${js}; return handler;`)(
      requireLiveMailPage, requireLiveMailboxSummary, clientMailFailure, { id: "test-account" });
    assert.deepEqual(await parse(Response.json(page)), page);
    await assert.rejects(parse(Response.json({ ...page, mailboxes: [{}] })), /unavailable/);
    await assert.rejects(parse(new Response("invalid-json")), /unavailable/);
    for (const [status, error] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"], [503, "retryable"]]) {
      await assert.rejects(parse(Response.json({ error }, { status })), new RegExp(error));
    }
    if (path.startsWith("components")) await assert.rejects(parse(Response.json({ ...page, accountId: "other-account" })), /unavailable/);
  }
}
console.log("Mailbox projections: actual personal/shared list and usage callbacks validate formats, identity and HTTP failures.");
