#!/usr/bin/env node
// Run the current adapter source against synthetic selective Email/get results.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as searchFilters from "../lib/tastemail/search-filter.ts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = readFileSync(resolve(root, "lib/tastemail/mail.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const MAIL = "urn:ietf:params:jmap:mail";
const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const SHARED = "22222222-2222-4222-8222-222222222222";
const INBOX = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";
const receivedAt = "2026-09-30T00:00:00Z";
const session = {
  username: "fixture@example.test", apiUrl: "/jmap/api",
  primaryAccounts: { [MAIL]: ACCOUNT },
  accounts: {
    [ACCOUNT]: { name: "Personal", isPersonal: true },
    [SHARED]: { name: "Team", isPersonal: false, "x-tastemail-rights": { mayRead: true } },
  },
};
let legacyFullList = false;
let listGets = 0;
let detailGets = 0;
let jmapRequests = 0;
let wrongDetailId = false;
let malformedDetail = false;
let expectedFilter = { inMailbox: INBOX };
let expectedAccount = null;
let mailboxRole = "inbox";
let extraMailboxes = [];
let mailboxName = "Inbox";
let emailMemberships = { [INBOX]: true };
const sessionModule = { exports: {} };
new Function("require", "exports", "module", ts.transpileModule(
  readFileSync(resolve(root, "lib/tastemail/session-contract.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)((name) => { assert.equal(name, "server-only"); return {}; }, sessionModule.exports, sessionModule);

function response(payload) {
  return Response.json(payload);
}

function email(summaryOnly) {
  return {
    id: MESSAGE, mailboxIds: emailMemberships, size: 2048,
    receivedAt, subject: "Synthetic subject",
    from: [{ name: "Sender", email: "sender@example.test" }],
    preview: "Synthetic preview", keywords: { $seen: false },
    ...(summaryOnly ? {} : {
      to: [{ email: "fixture@example.test" }], textBody: [{ partId: "1", type: "text/plain" }],
      htmlBody: [], bodyValues: { "1": { value: "Synthetic full body" } }, attachments: [],
    }),
  };
}

async function tastemailRequest(path, token, options) {
  assert.equal(token, "fixture-token");
  if (path === "/.well-known/jmap") return response(session);
  assert.equal(path, "/jmap/api");
  jmapRequests += 1;
  const { methodCalls } = JSON.parse(options.body);
  return response({ methodResponses: methodCalls.map(([name, args, id]) => {
    assert.ok([ACCOUNT, SHARED].includes(args.accountId));
    if (expectedAccount) assert.equal(args.accountId, expectedAccount);
    if (name === "Mailbox/get") return [name, { list: [{ id: INBOX, name: mailboxName, role: mailboxRole, totalEmails: 1, unreadEmails: 1 }, ...extraMailboxes] }, id];
    if (name === "Email/query") {
      if (id === "all-count" || id === "unread-count") {
        assert.deepEqual(args.filter, id === "all-count" ? null : { notKeyword: "$seen" });
        return [name, { ids: [MESSAGE], position: 0, total: 1 }, id];
      }
      assert.deepEqual(args.filter, expectedFilter);
      return [name, { ids: [MESSAGE], position: 0, total: 1 }, id];
    }
    assert.equal(name, "Email/get");
    assert.deepEqual(args.ids, [MESSAGE]);
    if (args.fetchTextBodyValues === false) {
      listGets += 1;
      assert.equal(args.fetchHTMLBodyValues, false);
      assert.deepEqual(args.properties, ["id", "mailboxIds", "size", "keywords", "receivedAt", "subject", "from", "preview"]);
      return [name, { state: "7", list: [email(!legacyFullList)] }, id];
    }
    detailGets += 1;
    assert.equal(args.fetchTextBodyValues, true);
    assert.equal(args.fetchHTMLBodyValues, true);
    for (const property of ["id", "bodyValues", "attachments", "textBody", "htmlBody"]) {
      assert.ok(args.properties.includes(property), `detail must request ${property}`);
    }
    const detail = email(false);
    if (wrongDetailId) detail.id = "55555555-5555-4555-8555-555555555555";
    if (malformedDetail) delete detail.bodyValues;
    return [name, { state: "7", list: [detail] }, id];
  }) });
}

const exports = {};
const compiledModule = { exports };
const mockRequire = (name) => {
  if (name === "./search-filter") return searchFilters;
  if (name === "server-only" || name === "./submission-limit") return {};
  if (name === "./server") return { tastemailRequest, serviceStatus: () => "retryable" };
  if (name === "./session-contract") return sessionModule.exports;
  if (name === "./preview") return { normalizeMailPreview: (value) => value };
  if (name === "../mailbox-move.mjs") return {};
  throw new Error(`Unexpected import: ${name}`);
};
new Function("require", "exports", "module", compiled)(mockRequire, exports, compiledModule);
const { loadLiveMailPage, loadLiveMailDetail, loadLiveSharedMailPage, loadLiveSharedMailDetail } = compiledModule.exports;

const personal = await loadLiveMailPage("fixture-token", "inbox", 0);
assert.equal(personal.total, 1);
assert.equal(personal.messages[0].detailLoaded, false);
assert.equal(personal.messages[0].sizeBytes, 2048);
assert.deepEqual(personal.messages[0].mailboxIds, [INBOX]);
assert.deepEqual(personal.messages[0].body, []);
assert.equal(personal.messages[0].preview, "Synthetic preview");
const personalDetail = await loadLiveMailDetail("fixture-token", MESSAGE);
assert.equal(personalDetail.detailLoaded, true);
assert.equal(personalDetail.bodyText, "Synthetic full body");

const shared = await loadLiveSharedMailPage("fixture-token", SHARED, INBOX, 0);
assert.equal(shared.messages[0].detailLoaded, false);
const sharedDetail = await loadLiveSharedMailDetail("fixture-token", SHARED, MESSAGE);
assert.equal(sharedDetail.detailLoaded, true);
assert.equal(sharedDetail.bodyText, personalDetail.bodyText);

legacyFullList = true;
const legacy = await loadLiveMailPage("fixture-token", "inbox", 0);
assert.equal(legacy.messages[0].detailLoaded, true);
assert.equal(legacy.messages[0].bodyText, "Synthetic full body");
assert.equal(listGets, 3);
assert.equal(detailGets, 2);

// Permission denial must stop before forwarding any mailbox/body request.
session.accounts[SHARED]["x-tastemail-rights"].mayRead = false;
const beforePermissionDenial = jmapRequests;
await assert.rejects(loadLiveSharedMailPage("fixture-token", SHARED, INBOX, 0), { status: "forbidden" });
await assert.rejects(loadLiveSharedMailDetail("fixture-token", SHARED, MESSAGE), { status: "forbidden" });
assert.equal(listGets, 3);
assert.equal(detailGets, 2);
assert.equal(jmapRequests, beforePermissionDenial);
session.accounts[SHARED]["x-tastemail-rights"].mayRead = true;

wrongDetailId = true;
await assert.rejects(loadLiveMailDetail("fixture-token", MESSAGE), { status: "unavailable" });
wrongDetailId = false;
malformedDetail = true;
await assert.rejects(loadLiveMailDetail("fixture-token", MESSAGE), { status: "unavailable" });
malformedDetail = false;

// Use the real JMAP session validator, not an always-successful substitute.
session.apiUrl = "https://untrusted.example.test/jmap/api";
const beforeInvalidSession = detailGets;
await assert.rejects(loadLiveMailDetail("fixture-token", MESSAGE), { status: "unavailable" });
assert.equal(detailGets, beforeInvalidSession);
session.apiUrl = "/jmap/api";

// Shared searches stay inside the selected account AND selected folder.
legacyFullList = false;
expectedAccount = SHARED;
expectedFilter = { operator: "AND", conditions: [{ inMailbox: INBOX }, { text: "합성 & 검색" }] };
const filtered = await loadLiveSharedMailPage("fixture-token", SHARED, INBOX, 0, '  "합성 & 검색"  ');
assert.equal(filtered.accountId, SHARED);
assert.equal(filtered.mailboxId, INBOX);
assert.equal(filtered.messages[0].detailLoaded, false);
assert.equal(filtered.total, 1);
expectedFilter = { operator: "AND", conditions: [{ inMailbox: INBOX }, { subject: "Synthetic subject" }] };
await loadLiveSharedMailPage("fixture-token", SHARED, INBOX, 0, 'subject:"Synthetic subject"');
const beforeUnknownFolder = jmapRequests;
const empty = await loadLiveSharedMailPage("fixture-token", SHARED, INBOX, 0, "in:unknown");
assert.equal(empty.total, 0);
assert.deepEqual(empty.messages, []);
assert.equal(jmapRequests, beforeUnknownFolder + 1); // Mailbox/get only, no broad Email/query.
await assert.rejects(loadLiveSharedMailPage("fixture-token", SHARED, INBOX, 0, "is:unknown"), searchFilters.InvalidSearchFilterError);
session.accounts[SHARED]["x-tastemail-rights"].mayRead = false;
const beforeSearchDenial = jmapRequests;
await assert.rejects(loadLiveSharedMailPage("fixture-token", SHARED, INBOX, 0, "Synthetic"), { status: "forbidden" });
assert.equal(jmapRequests, beforeSearchDenial);
session.accounts[SHARED]["x-tastemail-rights"].mayRead = true;
// All-mail is a personal-account query, not a nonexistent Mailbox role.
expectedAccount = ACCOUNT;
expectedFilter = null;
for (const [role, folder] of [["inbox", "inbox"], ["trash", "trash"], ["junk", "spam"], [null, "custom"]]) {
  mailboxRole = role;
  const all = await loadLiveMailPage("fixture-token", "all", 0);
  assert.equal(all.accountId, ACCOUNT);
  assert.equal(all.mailboxId, null);
  assert.equal(all.total, 1);
  assert.equal(all.messages[0].folder, folder);
  assert.equal(all.messages[0].detailLoaded, false);
}
mailboxName = "개발";
mailboxRole = null;
extraMailboxes = [
  { id: "github", name: "개발/Github", role: null },
  { id: "chatgpt", name: "개발/ChatGPT", role: null },
  { id: "nested", name: "개발/Github/Issues", role: null },
  { id: "unrelated", name: "개발팀/Other", role: null },
  { id: "special", name: "개발/Sent", role: "sent" },
].map(item => ({ ...item, totalEmails: 1, unreadEmails: 0 }));
expectedFilter = { operator: "OR", conditions: [INBOX, "github", "chatgpt", "nested"].map(inMailbox => ({ inMailbox })) };
const subtree = await loadLiveMailPage("fixture-token", "custom", 0, INBOX);
assert.equal(subtree.mailboxId, INBOX);
assert.equal(subtree.messages.length, 1);
extraMailboxes = [];
expectedFilter = { inMailbox: INBOX };
await loadLiveMailPage("fixture-token", "custom", 0, INBOX);

const contextSource = readFileSync(resolve(root, "context/mail-context.tsx"), "utf8");
const sourceSelection = contextSource.slice(contextSource.indexOf("    const selectedMailbox = mailboxes.find(mailbox => mailbox.id === activeCustomMailboxId);"), contextSource.indexOf("    const snapshot = confirmedMailSnapshot", contextSource.indexOf("    const selectedMailbox = mailboxes.find")));
const sourceResolver = new Function("mailboxes", "emails", "id", "activeCustomMailboxId", "activeFolder", "sourceRole", ts.transpileModule(sourceSelection, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "return sourceMailboxId;");
const moveBoxes = [{ id: "parent", name: "개발", role: null }, { id: "child", name: "개발/Github", role: null }, { id: "other", name: "개발팀/Other", role: null }, { id: "sent", name: "개발/Sent", role: "sent" }];
assert.equal(sourceResolver(moveBoxes, [{ id: MESSAGE, mailboxIds: ["child", "sent"] }], MESSAGE, "parent", "custom", "custom"), "child");
assert.equal(sourceResolver(moveBoxes, [{ id: MESSAGE, mailboxIds: ["parent", "child"] }], MESSAGE, "parent", "custom", "custom"), "parent");
assert.equal(sourceResolver(moveBoxes, [{ id: MESSAGE, mailboxIds: ["other", "sent"] }], MESSAGE, "parent", "custom", "custom"), "parent");
for (const [role, folder] of [["drafts", "drafts"], ["sent", "sent"], ["trash", "trash"], ["junk", "spam"], ["inbox", "inbox"], ["archive", "archive"], [null, "custom"]]) {
  mailboxRole = role;
  assert.equal((await loadLiveMailDetail("fixture-token", MESSAGE)).folder, folder, "detail must preserve current server mailbox membership");
}
emailMemberships = {};
await assert.rejects(loadLiveMailDetail("fixture-token", MESSAGE), { status: "unavailable" });
mailboxRole = "drafts";
extraMailboxes = [{ id: "trash", name: "Trash", role: "trash", totalEmails: 1, unreadEmails: 0 }];
emailMemberships = { [INBOX]: true, trash: true };
assert.equal((await loadLiveMailDetail("fixture-token", MESSAGE)).folder, "trash", "trashed draft must not be editable as a current draft");
process.stdout.write("Live mail selective read: current-source contract, subtree aggregation and actual child move source passed\n");
