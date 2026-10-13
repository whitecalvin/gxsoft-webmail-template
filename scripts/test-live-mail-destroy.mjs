#!/usr/bin/env node
// Exercises the real server adapter against synthetic JMAP responses only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { projectMailboxUsageAfterMove } from "../lib/mailbox-usage.ts";
import { resolveMoveSource } from "../lib/mailbox-move.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = readFileSync(resolve(root, "lib/tastemail/mail.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const MAIL = "urn:ietf:params:jmap:mail";
const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const TRASH = "22222222-2222-4222-8222-222222222222";
const INBOX = "33333333-3333-4333-8333-333333333333";
const EMAIL = "44444444-4444-4444-8444-444444444444";
const SENT = "55555555-5555-4555-8555-555555555555";
const CUSTOM = "66666666-6666-4666-8666-666666666666";
let mailboxIds = { [TRASH]: true };
let expectedMovePatch = null;
let destroyResult = { destroyed: [EMAIL], notDestroyed: {} };
let setCalls = 0;
let moveCalls = 0;
let moveSetAttempts = 0;
let moveConflictsRemaining = 0;
let moveFailureType = null;
let emailSize = 2048;

function response(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

async function tastemailRequest(path, token, options) {
  assert.equal(token, "fixture-token");
  if (path === "/.well-known/jmap") return response({ apiUrl: "/jmap/api", primaryAccounts: { [MAIL]: ACCOUNT }, accounts: {
    [ACCOUNT]: { isPersonal: false, "x-tastemail-rights": { mayWrite: true } },
  } });
  assert.equal(path, "/jmap/api");
  const input = JSON.parse(options.body);
  const methodResponses = input.methodCalls.map(([name, args, id]) => {
    assert.equal(args.accountId, ACCOUNT);
    if (name === "Mailbox/get") return [name, { list: [
      { id: TRASH, name: "Trash", role: "trash", totalEmails: 1, unreadEmails: 0 },
      { id: INBOX, name: "Inbox", role: "inbox", totalEmails: 0, unreadEmails: 0 },
      { id: SENT, name: "Sent", role: "sent", totalEmails: 1, unreadEmails: 0 },
      { id: CUSTOM, name: "Project", role: null, totalEmails: 1, unreadEmails: 0 },
    ] }, id];
    if (name === "Email/get") {
      assert.deepEqual(args.ids, [EMAIL]);
      assert.deepEqual(args.properties, id === "shared-move-email" ? ["id", "mailboxIds"] : ["id", "mailboxIds", "size"]);
      return [name, { state: "7", list: [{ id: EMAIL, mailboxIds, size: emailSize }] }, id];
    }
    assert.equal(name, "Email/set");
    assert.equal(args.ifInState, "7");
    if (args.update) {
      assert.deepEqual(args.update, { [EMAIL]: expectedMovePatch });
      moveSetAttempts += 1;
      if (moveConflictsRemaining > 0) {
        moveConflictsRemaining -= 1;
        return ["error", { type: "stateMismatch" }, id];
      }
      if (moveFailureType) {
        const type = moveFailureType;
        moveFailureType = null;
        return ["error", { type }, id];
      }
      for (const [key, present] of Object.entries(expectedMovePatch)) {
        const mailboxId = key.slice("mailboxIds/".length);
        if (present) mailboxIds[mailboxId] = true;
        else delete mailboxIds[mailboxId];
      }
      moveCalls += 1;
      return [name, { updated: { [EMAIL]: null }, notUpdated: {} }, id];
    }
    assert.deepEqual(args.destroy, [EMAIL]);
    setCalls += 1;
    return [name, destroyResult, id];
  });
  return response({ methodResponses });
}

const exports = {};
const compiledModule = { exports };
const mockRequire = (name) => {
  if (name === "server-only" || name === "./search-filter" || name === "./session-contract" ||
      name === "./submission-limit" || name === "./preview") return {};
  if (name === "./server") return { tastemailRequest, serviceStatus: () => "retryable" };
  if (name === "../mailbox-move.mjs") return { resolveMoveSource };
  throw new Error(`Unexpected import: ${name}`);
};
new Function("require", "exports", "module", compiled)(mockRequire, exports, compiledModule);
const { destroyTrashedLiveMail, moveLiveMail, moveLiveSharedMail } = compiledModule.exports;

mailboxIds = { [SENT]: true };
expectedMovePatch = { [`mailboxIds/${SENT}`]: false, [`mailboxIds/${TRASH}`]: true };
assert.deepEqual(await moveLiveMail("fixture-token", EMAIL, "trash"), { sizeBytes: 2048, mailboxIds: [SENT] });
assert.deepEqual(mailboxIds, { [TRASH]: true });
assert.equal(moveCalls, 1);

mailboxIds = { [SENT]: true, [INBOX]: true, [CUSTOM]: true };
expectedMovePatch = {
  [`mailboxIds/${INBOX}`]: false,
  [`mailboxIds/${TRASH}`]: true,
};
const inboxMoveSnapshot = await moveLiveMail("fixture-token", EMAIL, "trash");
assert.deepEqual(inboxMoveSnapshot, { sizeBytes: 2048, mailboxIds: [SENT, INBOX, CUSTOM] });
const usageAfterInboxDelete = projectMailboxUsageAfterMove([
  { id: SENT, role: "sent", usedBytes: 4096 },
  { id: INBOX, role: "inbox", usedBytes: 8192 },
  { id: TRASH, role: "trash", usedBytes: 1024 },
  { id: CUSTOM, role: null, usedBytes: 3072 },
], inboxMoveSnapshot, "trash", null);
assert.deepEqual(usageAfterInboxDelete.map((item) => item.usedBytes), [4096, 6144, 3072, 3072]);
assert.deepEqual(mailboxIds, { [SENT]: true, [TRASH]: true, [CUSTOM]: true });
assert.equal(moveCalls, 2);

mailboxIds = { [SENT]: true };
expectedMovePatch = { [`mailboxIds/${SENT}`]: false, [`mailboxIds/${TRASH}`]: true };
moveConflictsRemaining = 1;
assert.deepEqual(await moveLiveMail("fixture-token", EMAIL, "trash"), { sizeBytes: 2048, mailboxIds: [SENT] });
assert.equal(moveSetAttempts, 4, "a definite state conflict should retry once");
assert.equal(moveCalls, 3);
assert.deepEqual(mailboxIds, { [TRASH]: true });

mailboxIds = { [SENT]: true };
moveConflictsRemaining = 2;
await assert.rejects(moveLiveMail("fixture-token", EMAIL, "trash"), { status: "conflict" });
assert.equal(moveSetAttempts, 6, "a second conflict must not trigger another retry");
assert.equal(moveCalls, 3);
assert.deepEqual(mailboxIds, { [SENT]: true });

moveFailureType = "serverFail";
await assert.rejects(moveLiveMail("fixture-token", EMAIL, "trash"), { status: "retryable" });
assert.equal(moveSetAttempts, 7, "an uncertain failure must not be retried");
assert.deepEqual(mailboxIds, { [SENT]: true });

for (const invalidSize of [-1, undefined]) {
  emailSize = invalidSize;
  await assert.rejects(moveLiveMail("fixture-token", EMAIL, "trash"), { status: "unavailable" });
  assert.equal(moveSetAttempts, 7, "missing or invalid size must be rejected before moving");
  assert.deepEqual(mailboxIds, { [SENT]: true });
}
emailSize = 2048;

mailboxIds = { [INBOX]: true };
await assert.rejects(destroyTrashedLiveMail("fixture-token", EMAIL), { status: "forbidden" });
assert.equal(setCalls, 0);

mailboxIds = { [TRASH]: true };
assert.deepEqual(await destroyTrashedLiveMail("fixture-token", EMAIL), { sizeBytes: 2048, mailboxIds: [TRASH] });
assert.equal(setCalls, 1);

emailSize = -1;
await assert.rejects(destroyTrashedLiveMail("fixture-token", EMAIL), { status: "unavailable" });
assert.equal(setCalls, 1, "invalid size must be rejected before mutation");
emailSize = 2048;

destroyResult = { destroyed: [], notDestroyed: { [EMAIL]: { type: "serverFail" } } };
await assert.rejects(destroyTrashedLiveMail("fixture-token", EMAIL), { status: "retryable" });
assert.equal(setCalls, 2);

destroyResult = { destroyed: [], notDestroyed: { [EMAIL]: { type: "notFound" } } };
await assert.rejects(destroyTrashedLiveMail("fixture-token", EMAIL), { status: "unavailable" });
assert.equal(setCalls, 3);

// Explicit sent/custom sources remove only that source, even with an inbox copy.
for (const sourceId of [SENT, CUSTOM]) {
  mailboxIds = { [SENT]: true, [INBOX]: true, [CUSTOM]: true };
  expectedMovePatch = { [`mailboxIds/${sourceId}`]: false, [`mailboxIds/${TRASH}`]: true };
  await moveLiveMail("fixture-token", EMAIL, "trash", sourceId);
  assert.equal(mailboxIds[sourceId], undefined);
  assert.equal(mailboxIds[sourceId === SENT ? INBOX : SENT], true);
}
mailboxIds = { [SENT]: true, [INBOX]: true, [CUSTOM]: true };
expectedMovePatch = { [`mailboxIds/${INBOX}`]: false, [`mailboxIds/${TRASH}`]: true };
await moveLiveSharedMail("fixture-token", ACCOUNT, EMAIL, INBOX, "trash");
assert.deepEqual(mailboxIds, { [SENT]: true, [CUSTOM]: true, [TRASH]: true });
const beforeAmbiguous = moveSetAttempts;
mailboxIds = { [INBOX]: true, [TRASH]: true, [SENT]: true };
await assert.rejects(moveLiveMail("fixture-token", EMAIL, { mailboxId: CUSTOM }), { status: "forbidden" });
await assert.rejects(moveLiveMail("fixture-token", EMAIL, "trash", CUSTOM), { status: "forbidden" });
assert.equal(moveSetAttempts, beforeAmbiguous, "ambiguous or missing source must not mutate");
process.stdout.write("Live mail move/destroy adapter: synthetic contract passed\n");
