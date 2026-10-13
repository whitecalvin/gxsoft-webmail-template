import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/tastemail/mail.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
let unread = 4;
const request = async (path, token, options) => {
  assert.equal(token, "fixture");
  assert.equal(path, "/jmap/api");
  const calls = JSON.parse(options.body).methodCalls;
  assert.equal(calls.length, 3);
  const responses = calls.map(([method, args, id]) => {
    assert.equal(args.accountId, "personal-account");
    if (method === "Mailbox/get") return [method, { list: [
      { id: "inbox", name: "Inbox", role: "inbox", totalEmails: 10, unreadEmails: 4 },
      { id: "custom", name: "Custom", role: null, totalEmails: 10, unreadEmails: 4 },
    ] }, id];
    assert.equal(method, "Email/query");
    assert.equal(args.limit, 1);
    assert.equal(args.calculateTotal, true);
    assert.equal(args.collapseThreads, false);
    assert.deepEqual(args.filter, id === "all-count" ? null : { notKeyword: "$seen" });
    return [method, { total: id === "all-count" ? 10 : unread }, id];
  });
  return Response.json({ methodResponses: responses });
};
const modules = {
  "server-only": {},
  "./server": { tastemailRequest: request },
  "./search-filter": {},
  "./session-contract": { validLiveJmapSession: () => true },
  "./submission-limit": {},
  "./preview": {},
  "../mailbox-move.mjs": {},
};
new Function("require", "exports", compiled)((name) => {
  assert.ok(Object.hasOwn(modules, name), name);
  return modules[name];
}, exports);
const session = { primaryAccounts: { "urn:ietf:params:jmap:mail": "personal-account" }, username: "fixture@example.test" };
const summary = await exports.loadLiveMailboxSummary("fixture", session);
assert.deepEqual(summary.allCounts, { total: 10, unread: 4 });
assert.equal(summary.mailboxes.reduce((sum, box) => sum + box.totalEmails, 0), 20);
unread = 11;
await assert.rejects(exports.loadLiveMailboxSummary("fixture", session), /unavailable/);
console.log("all-mail counts: unique server totals, unread filter, personal account and invalid totals passed");
