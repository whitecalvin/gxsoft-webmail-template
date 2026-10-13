import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Extract the actual provider callbacks so a duplicated model cannot pass
// while the application's stale-response guard remains missing.
const source = ts.createSourceFile("mail-context.tsx", readFileSync(new URL("../context/mail-context.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let flagHandler;
let pageHandler;
let summaryHandler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "updateFlag") flagHandler = node.initializer;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "then") {
    const callback = node.arguments[0];
    if (callback && ts.isArrowFunction(callback) && callback.parameters[0]?.name.getText(source) === "page") pageHandler = callback;
    if (callback && ts.isArrowFunction(callback) && callback.parameters[0]?.name.getText(source) === "summary") summaryHandler = callback;
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(flagHandler);
assert.ok(pageHandler);
assert.ok(summaryHandler);
function compile(callback, bindings) {
  const js = ts.transpileModule(`const handler = ${callback.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return handler;`)(...Object.values(bindings));
}

for (const flag of ["seen", "starred"]) {
  const revision = { current: 4 };
  let operation;
  let summaryKey = "ready";
  let pageUpdates = 0;
  const common = {
    emails: [], confirmedUnread: { current: new Map() }, setAllCounts: () => {}, setMailboxes: () => {},
    uncertainMutationIdSet: { current: new Set() },
    enqueueLiveMutation: (_id, _key, callback) => { operation = callback; },
    setMutationStatus: () => {}, fetch: async () => ({}),
    MAIL_MUTATION_TIMEOUT_MS: 1000,
    mailboxDataRevision: revision, activeFolder: "inbox",
    setLoadAttempt: () => { throw new Error("Flags must not unconditionally reload the page"); },
    setEmails: () => { pageUpdates += 1; },
    confirmMessageFlagInPage: () => {},
    setLoadedMailboxKey: (value) => { summaryKey = value; },
    reportLiveMutationFailure: () => "retryable",
  };
  compile(flagHandler, { ...common, requireConfirmedMailMutation: async () => {} })("synthetic", flag, true);
  await operation();
  assert.equal(revision.current, 5);
  assert.equal(summaryKey, null);
  assert.equal(pageUpdates, 1);

  revision.current = 4;
  pageUpdates = 0;
  compile(flagHandler, { ...common, requireConfirmedMailMutation: async () => { throw new Error("rejected"); }, setLoadAttempt: () => {} })("synthetic", flag, true);
  await operation();
  assert.equal(revision.current, 4, "Rejected flags must not advance confirmation revision");
  assert.equal(pageUpdates, 0);
}

for (const aborted of [false, true]) {
  let attempts = 0;
  const callback = compile(pageHandler, {
    controller: { signal: { aborted } }, startedAtRevision: 4,
    mailboxDataRevision: { current: 5 },
    setLoadAttempt: (update) => { attempts = update(attempts); },
  });
  callback({ messages: [{ id: "synthetic", unread: true, starred: false }] });
  assert.equal(attempts, aborted ? 0 : 1);
  let summaryAttempts = 0;
  compile(summaryHandler, {
    controller: { signal: { aborted } }, startedAtRevision: 4,
    mailboxDataRevision: { current: 5 },
    setMailboxSummaryRefreshTick: (update) => { summaryAttempts = update(summaryAttempts); },
  })({ mailboxes: [] });
  assert.equal(summaryAttempts, aborted ? 0 : 1);
}
console.log("Real mail provider: confirmed flags invalidate stale reads; stale page retries without unconditional flag reload.");

// Execute the real flag callback for several selected messages, including
// out-of-order acknowledgments, a duplicate acknowledgment and a rejection.
const rows = ["a", "b", "c", "rejected"].map(id => ({ id, unread: true, mailboxIds: ["inbox", "custom"] }));
const confirmedUnread = { current: new Map(rows.map(row => [row.id, true])) };
let allCounts = { total: 8, unread: 4 };
let mailboxes = [{ id: "inbox", totalEmails: 8, unreadEmails: 4 }, { id: "custom", totalEmails: 4, unreadEmails: 4 }, { id: "other", totalEmails: 2, unreadEmails: 2 }];
const queued = new Map();
const flagAction = compile(flagHandler, {
  emails: rows, uncertainMutationIdSet: { current: new Set() }, confirmedUnread,
  enqueueLiveMutation: (id, _key, action, visible) => { assert.equal(visible, true); queued.set(id, action); },
  setAllCounts: update => { allCounts = update(allCounts); },
  setMailboxes: update => { mailboxes = update(mailboxes); },
  setMutationStatus: () => {}, fetch: async (_url, options) => JSON.parse(options.body),
  requireConfirmedMailMutation: async receipt => { if (receipt.messageId === "rejected") throw new Error("rejected"); },
  MAIL_MUTATION_TIMEOUT_MS: 1000, mailboxDataRevision: { current: 0 }, activeFolder: "inbox",
  setEmails: () => {}, confirmMessageFlagInPage: () => {}, setLoadedMailboxKey: () => {},
  reportLiveMutationFailure: () => "retryable", setLoadAttempt: () => {},
});
for (const row of rows) flagAction(row.id, "seen", true, true);
for (const id of ["c", "a", "b", "rejected"]) await queued.get(id)();
assert.equal(allCounts.unread, 1);
assert.deepEqual(mailboxes.map(box => box.unreadEmails), [1, 1, 2]);
await queued.get("a")();
assert.equal(allCounts.unread, 1, "Duplicate confirmation must not decrement twice");
assert.deepEqual(mailboxes.map(box => box.unreadEmails), [1, 1, 2]);
assert.match(source.text, /pendingUsageMoves.length > 0 \|\| pendingMutationIds.length > 0/);
assert.match(source.text, /updateFlag\(id, "seen", read, true\)/);
console.log("Bulk read counts: every confirmed message, multiple memberships, rejection and duplicate guards passed.");
