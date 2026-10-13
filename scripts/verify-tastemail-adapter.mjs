#!/usr/bin/env node
// Contract smoke test against a synthetic loopback API; no real account or mail is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { makeAwaySource, replaceManagedAwayRule } from "../lib/away-rule.ts";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
// System errors are client toasts, not inline SSR text. Inspect the actual
// Flight component props rather than matching a translation catalog string.
function assertSystemErrorToast(html, message, label) {
  const flight = [...html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/gu)]
    .map(match => JSON.parse(match[1]))
    .filter(frame => frame[0] === 1 && typeof frame[1] === "string")
    .map(frame => frame[1]).join("");
  const records = flight.split("\n");
  const noticeModule = records.find(line => /^[\da-f]+:I/u.test(line) && line.endsWith(',"SystemErrorNotice"]'));
  assert.ok(noticeModule, `${label}: SystemErrorNotice client module must be present`);
  const reference = `$L${noticeModule.slice(0, noticeModule.indexOf(":"))}`;
  let found = false;
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value) && value[0] === "$" && value[1] === reference) {
      assert.equal(value[3].message, message, `${label}: toast message`);
      assert.equal(value[3].reloadOnAction, true, `${label}: retry reload`);
      assert.equal(value[3].actionLabel, "다시 시도", `${label}: retry label`);
      found = true;
    }
    Object.values(value).forEach(visit);
  }
  for (const record of records) {
    if (!/^[\da-f]+:\[/u.test(record)) continue;
    const body = record.slice(record.indexOf(":") + 1);
    visit(JSON.parse(body));
  }
  assert.ok(found, `${label}: error toast props must be rendered`);
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "");
  assert.equal(visible.includes(message), false, `${label}: error must not shift inline content`);
}
const LOCALES = ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"];
const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const SUBMISSION_CAPABILITY = "urn:ietf:params:jmap:submission";
const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const ALTERNATE_IDENTITY = "11111111-1111-4111-8111-111111111113";
const SECONDARY_ACCOUNT = "11111111-1111-4111-8111-111111111112";
const SECONDARY_INBOX = "22222222-2222-4222-8222-222222222223";
const SHARED_ACCOUNT = "66666666-6666-4666-8666-666666666666";
const READ_ONLY_SHARED_ACCOUNT = "66666666-6666-4666-8666-666666666667";
const INBOX = "22222222-2222-4222-8222-222222222222";
const DRAFTS = "99999999-9999-4999-8999-999999999998";
const ARCHIVE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPAM = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TRASH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CUSTOM = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CUSTOM_OTHER = "ffffffff-ffff-4fff-8fff-fffffffffffe";
const SHARED_INBOX = "77777777-7777-4777-8777-777777777777";
const SHARED_TRASH = "77777777-7777-4777-8777-777777777776";
const SHARED_CUSTOM = "77777777-7777-4777-8777-777777777775";
const SHARED_DRAFTS = "77777777-7777-4777-8777-777777777778";
const SHARED_DRAFT = "77777777-7777-4777-8777-777777777779";
const SHARED_RESAVED_DRAFT = "77777777-7777-4777-8777-777777777774";
const EMAIL = "33333333-3333-4333-8333-333333333333";
const EMAIL_SIZE = 4096;
const DRAFT = "99999999-9999-4999-8999-999999999997";
const RESAVED_DRAFT = "99999999-9999-4999-8999-999999999994";
const SUBMISSION = "99999999-9999-4999-8999-999999999996";
const UPLOAD = "99999999-9999-4999-8999-999999999995";
const SERVER_FAIL_EMAIL = "88888888-8888-4888-8888-888888888888";
const EVENT = "55555555-5555-4555-8555-555555555555";
const CONTACT = "44444444-4444-4444-8444-444444444444";
const CREATED_CONTACT = "44444444-4444-4444-8444-444444444445";
const CREATED_EVENT = "99999999-9999-4999-8999-999999999999";
const QUARANTINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VACATION_RULE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc";
const ATTACHMENT = `m:${EMAIL}:0`;
const TOKEN = "synthetic-loopback-token";
const SECONDARY_TOKEN = "synthetic-secondary-token";
const SAME_USERNAME_SECONDARY_TOKEN = "synthetic-same-username-secondary-token";
const PAGED_IDS = Array.from({ length: 51 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
let fixtureSeen = false;
let sharedFixtureSeen = false;
let sharedFixtureStarred = false;
let sharedFixtureMailbox = SHARED_INBOX;
let sharedFixtureDestroyed = false;
let sharedStaleMove = false;
let sharedStaleDestroy = false;
let fixtureStarred = false;
let createdDraftCount = 0;
let queuedSubmissionCount = 0;
let expectedScheduleAtUtc = null;
let expectedSharedScheduleAtUtc = null;
let personalPendingSendAt = null;
let sharedPendingSendAt = null;
let saturatedSubmissionList = false;
let selectiveEmailGet = false;
let selectiveSharedEmailGet = false;
let expectSelfReply = false;
let sharedSubmissionCount = 0;
let sharedDraftCleanupCount = 0;
let sharedResavedCleanupCount = 0;
let sharedDraftExists = false;
let sharedResavedExists = false;
let sharedDraftCreateFails = false;
let sharedSubmissionMode = "success";
let cleanedDraftCount = 0;
let submissionMode = "success";
let personalDraftFailureType = null;
let fixtureMailbox = INBOX;
let fixtureCustomMembership = true;
let fixtureOtherCustomMembership = false;
let fixtureDestroyed = false;
function fixturePersonalMailboxIds() {
  return [fixtureMailbox, ...(fixtureCustomMembership ? [CUSTOM] : []), ...(fixtureOtherCustomMembership ? [CUSTOM_OTHER] : [])];
}
let staleMove = 0;
let healthStatus = 200;
let adminAccessStatus = 403;
const { adminOverviewFixture: adminFixture } = await import("./fixtures/admin-overview.mjs");
let eventRevision = 1;
let eventStatus = "confirmed";
let eventAttendees = [];
let eventMutationCalls = 0;
let eventCreateCalls = 0;
let ascendingSearchCount = 0;
let fixturePagination = false;
let jmapSessionReads = 0;
let fixtureContacts = [{ id: CONTACT, displayName: "Fixture Contact", email: "contact@example.test", createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" }];
let ruleRevision = 2;
let ruleItems = [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Fixture rule", kind: "filter",
  source: "keep;", enabled: true, position: 0, updatedAt: "2026-09-28T00:00:00Z" }];

function fixtureRules() {
  return { revision: ruleRevision, mode: "rules", source: `# Managed by TASTEMAIL Web Mail as ${ruleItems.length} ordered rules.\n`,
    enabled: ruleItems.some((rule) => rule.enabled), rules: ruleItems };
}

function fixtureEvent() {
  return {
    id: EVENT, organizerAddress: "fixture@example.test", attendeeAddresses: eventAttendees,
    revision: eventRevision, title: "Fixture event", description: "Synthetic event",
    location: "Test room", startsAt: "2026-09-28T10:00:00Z", endsAt: "2026-09-28T11:00:00Z",
    allDay: false, timezone: "Asia/Seoul", status: eventStatus,
    response: "accepted", conflict: false,
  };
}

function reply(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function body(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw);
}

const api = createServer(async (request, response) => {
  if (request.url === "/health" && request.method === "GET") {
    assert.equal(request.headers.authorization, undefined);
    return healthStatus === 200
      ? reply(response, 200, { status: "ok", service: "tastedev-mail" })
      : reply(response, healthStatus, { status: "unavailable" });
  }
  if (request.url === "/api/auth/session" && request.method === "POST") {
    const credentials = await body(request);
    if (credentials.username === "mfa@example.test" && credentials.password === "fixture-only") {
      if (!credentials.mfaCode) return reply(response, 401, { type: "mfaRequired" });
      if (credentials.mfaCode !== "123456") return reply(response, 401, { type: "invalidMfaCode" });
    }
    if (credentials.username === "forbidden@example.test") return reply(response, 403, { type: "forbidden" });
    if (credentials.username === "limited@example.test") return reply(response, 429, { type: "rateLimit" });
    if (credentials.username === "unavailable@example.test") return reply(response, 503, { type: "serverFail" });
    return credentials.username === "fixture@example.test" && credentials.password === "fixture-secondary"
      ? reply(response, 200, { accessToken: SAME_USERNAME_SECONDARY_TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() })
      : credentials.username === "second@example.test" && credentials.password === "fixture-only"
      ? reply(response, 200, { accessToken: SECONDARY_TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() })
      : credentials.username === "fixture@example.test" && credentials.password === "fixture-only"
      || credentials.username === "mfa@example.test" && credentials.password === "fixture-only" && credentials.mfaCode === "123456"
      ? reply(response, 200, { accessToken: TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() })
      : reply(response, 401, { type: "unauthorized" });
  }
  if (request.headers.authorization === "Bearer expired-token") return reply(response, 401, { type: "unauthorized" });
  if (request.headers.authorization === "Bearer forbidden-token") return reply(response, 403, { type: "forbidden" });
  if (request.headers.authorization === "Bearer limited-token") return reply(response, 429, { type: "rateLimit" });
  if (request.headers.authorization === "Bearer unavailable-token") return reply(response, 503, { type: "serverFail" });
  if (request.headers.authorization === "Bearer missing-session-token" && request.url === "/.well-known/jmap") return reply(response, 404, { type: "notFound" });
  if (request.headers.authorization === "Bearer malformed-session-token" && request.url === "/.well-known/jmap") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{");
    return;
  }
  if (request.headers.authorization === "Bearer incomplete-session-token" && request.url === "/.well-known/jmap") {
    return reply(response, 200, { username: "fixture@example.test", apiUrl: "/jmap/api" });
  }
  if ([`Bearer ${SECONDARY_TOKEN}`, `Bearer ${SAME_USERNAME_SECONDARY_TOKEN}`].includes(request.headers.authorization)) {
    const sameUsername = request.headers.authorization === `Bearer ${SAME_USERNAME_SECONDARY_TOKEN}`;
    const username = sameUsername ? "fixture@example.test" : "second@example.test";
    if (request.url === "/.well-known/jmap") return reply(response, 200, {
      apiUrl: "/jmap/api", username, primaryAccounts: { [MAIL]: SECONDARY_ACCOUNT },
      accounts: { [SECONDARY_ACCOUNT]: { name: username, isPersonal: true, accountCapabilities: { [MAIL]: {} } } },
    });
    if (request.url === "/jmap/api" && request.method === "POST") {
      const input = await body(request);
      assert.deepEqual(input.methodCalls, [
        ["Mailbox/get", { accountId: SECONDARY_ACCOUNT }, "mailboxes"],
        ["Email/query", { accountId: SECONDARY_ACCOUNT, filter: null, limit: 1, calculateTotal: true, collapseThreads: false }, "all-count"],
        ["Email/query", { accountId: SECONDARY_ACCOUNT, filter: { notKeyword: "$seen" }, limit: 1, calculateTotal: true, collapseThreads: false }, "unread-count"],
      ]);
      return reply(response, 200, { methodResponses: [["Mailbox/get", { list: [{
        id: SECONDARY_INBOX, name: "Inbox", role: "inbox", totalEmails: 0, unreadEmails: 0,
        "x-tastemail-usedBytes": 6291456, "x-tastemail-quotaBytes": 4294967296,
      }] }, "mailboxes"],
      ["Email/query", { accountId: SECONDARY_ACCOUNT, ids: [], position: 0, total: 0 }, "all-count"],
      ["Email/query", { accountId: SECONDARY_ACCOUNT, ids: [], position: 0, total: 0 }, "unread-count"]] });
    }
    return reply(response, 401, { type: "unauthorized" });
  }
  if (request.headers.authorization !== `Bearer ${TOKEN}`) return reply(response, 401, { type: "unauthorized" });
  if (request.url === "/api/admin/operations" && request.method === "GET") {
    return adminAccessStatus === 200
      ? reply(response, 200, { ...adminFixture, internalCredential: "must-not-project-admin-extra" })
      : reply(response, adminAccessStatus, { type: "forbidden" });
  }
  if (request.url === "/api/auth/session" && request.method === "DELETE") return reply(response, 204, {});
  if (request.url === "/.well-known/jmap") {
    jmapSessionReads += 1;
    return reply(response, 200, { apiUrl: "/jmap/api", username: "fixture@example.test", primaryAccounts: { [MAIL]: ACCOUNT },
      capabilities: { [CORE]: { maxObjectsInGet: 500 } }, accounts: {
      [ACCOUNT]: { name: "fixture@example.test", isPersonal: true, accountCapabilities: { [MAIL]: { maxSizeAttachmentsPerEmail: 10_485_760 }, [SUBMISSION_CAPABILITY]: { maxDelayedSend: 604_800 } } },
      [SHARED_ACCOUNT]: { name: "team@example.test", isPersonal: false, accountCapabilities: { [MAIL]: { maxSizeAttachmentsPerEmail: 10_485_760 }, [SUBMISSION_CAPABILITY]: { maxDelayedSend: 604_800 } }, "x-tastemail-rights": { mayRead: true, mayWrite: true, maySend: true } },
      [READ_ONLY_SHARED_ACCOUNT]: { name: "readonly@example.test", isPersonal: false, "x-tastemail-rights": { mayRead: true, mayWrite: false, maySend: false } },
    } });
  }
  if (request.url === "/api/user/preferences" && request.method === "GET") {
    return reply(response, 200, {
      mailSignature: "Synthetic sign-off", mailSignatureHtml: "<strong>Synthetic sign-off</strong>", mailSignatureFormat: "text/html", onboardingCompleted: true, onboardingRevision: 1,
      identities: [
        { id: ACCOUNT, address: "fixture@example.test", displayName: "Fixture Sender", isDefault: true,
          mailSignature: "Synthetic sign-off", mailSignatureHtml: "<strong>Synthetic sign-off</strong>", mailSignatureFormat: "text/html" },
        { id: ALTERNATE_IDENTITY, address: "alias@example.test", displayName: "Alias Sender", isDefault: false,
          mailSignature: "Alias sign-off", mailSignatureHtml: "<em>Alias sign-off</em>", mailSignatureFormat: "text/html" },
      ],
    });
  }
  if (request.url?.startsWith("/jmap/download/") && request.method === "GET") {
    const segments = new URL(request.url, "http://127.0.0.1").pathname.split("/").map(decodeURIComponent);
    assert.ok([ACCOUNT, SHARED_ACCOUNT].includes(segments[3]));
    assert.deepEqual(segments.slice(4), [ATTACHMENT, "attachment"]);
    response.writeHead(200, { "content-type": "text/plain", "content-disposition": "attachment; filename=\"fixture.txt\"" });
    response.end("synthetic-attachment");
    return;
  }
  if ([`/jmap/upload/${ACCOUNT}`, `/jmap/upload/${SHARED_ACCOUNT}`].includes(request.url) && request.method === "POST") {
    const uploadType = request.headers["content-type"];
    assert.ok(["text/plain", "application/x-fixture-too-large", "application/x-fixture-over-quota", "application/x-fixture-not-found", "application/x-fixture-server-fail"].includes(uploadType));
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const uploaded = Buffer.concat(chunks);
    assert.equal(uploaded.toString(), "synthetic-upload");
    if (uploadType === "application/x-fixture-too-large") return reply(response, 413, { type: "tooLarge" });
    if (uploadType === "application/x-fixture-over-quota") return reply(response, 507, { type: "overQuota" });
    if (uploadType === "application/x-fixture-not-found") return reply(response, 404, { type: "notFound" });
    if (uploadType === "application/x-fixture-server-fail") return reply(response, 500, { type: "serverFail" });
    return reply(response, 201, { accountId: request.url.split("/").at(-1), blobId: `u:${UPLOAD}`, type: "text/plain", size: uploaded.length });
  }
  if (request.url === "/api/contacts" && request.method === "GET") {
    return reply(response, 200, { contacts: fixtureContacts });
  }
  if (request.url === "/api/contacts" && request.method === "POST") {
    const input = await body(request);
    if (fixtureContacts.some((contact) => contact.email === input.email)) return reply(response, 409, { type: "conflict" });
    const contact = { id: CREATED_CONTACT, displayName: input.displayName, email: input.email, createdAt: "2026-09-29T00:00:00Z", updatedAt: "2026-09-29T00:00:00Z" };
    fixtureContacts = [...fixtureContacts, contact];
    return reply(response, 200, contact);
  }
  if (request.url?.startsWith("/api/contacts/") && (request.method === "PATCH" || request.method === "DELETE")) {
    const id = request.url.slice("/api/contacts/".length);
    const existing = fixtureContacts.find((contact) => contact.id === id);
    if (!existing) return reply(response, 404, { type: "notFound" });
    if (request.method === "DELETE") {
      fixtureContacts = fixtureContacts.filter((contact) => contact.id !== id);
      response.writeHead(204);
      response.end();
      return;
    }
    const input = await body(request);
    if (fixtureContacts.some((contact) => contact.id !== id && contact.email === input.email)) return reply(response, 409, { type: "conflict" });
    const updated = { ...existing, displayName: input.displayName, email: input.email, updatedAt: "2026-09-29T01:00:00Z" };
    fixtureContacts = fixtureContacts.map((contact) => contact.id === id ? updated : contact);
    return reply(response, 200, updated);
  }
  if (request.url === "/api/contacts/suggestions?q=fixture&limit=8" && request.method === "GET") {
    return reply(response, 200, { suggestions: [{ name: "Fixture Contact", email: "contact@example.test", interactionCount: 2, lastUsedAt: "2026-09-28T00:00:00Z", saved: true }] });
  }
  if (request.url === "/api/shared-mailboxes" && request.method === "GET") {
    return reply(response, 200, { items: [{
      id: "66666666-6666-4666-8666-666666666666", address: "team@example.test", displayName: "Fixture Team",
      quotaBytes: 10737418240, usedBytes: 1048576, revision: 1,
      rights: { mayRead: true, mayWrite: true, maySend: true, mayManage: false },
      createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z",
    }] });
  }
  if (request.url === "/api/approvals" && request.method === "GET") {
    return reply(response, 200, { items: [{
      id: "88888888-8888-4888-8888-888888888888", requesterUserId: ACCOUNT,
      requesterUsername: "fixture@example.test", title: "Fixture approval", description: "Synthetic request",
      state: "pending", currentStep: 1, isMyTurn: true,
      steps: [{ id: "99999999-9999-4999-8999-999999999999", position: 1, approverUserId: ACCOUNT,
        approverUsername: "fixture@example.test", state: "pending", comment: "", actedAt: null }],
      decidedAt: null, createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z",
    }] });
  }
  if (request.url === "/api/user/mail-rules" && request.method === "GET") {
    return reply(response, 200, fixtureRules());
  }
  if (request.url === "/api/user/mail-rules/validate" && request.method === "POST") {
    const input = await body(request);
    return typeof input.source === "string" && input.source.startsWith('# GXWebMail vacation v1\nrequire "vacation";')
      ? reply(response, 200, { valid: true }) : reply(response, 400, { type: "invalidRequest" });
  }
  if (request.url === "/api/user/mail-rules" && request.method === "PUT") {
    const input = await body(request);
    if (input.expectedRevision !== ruleRevision) return reply(response, 409, { type: "conflict" });
    assert.equal(input.rules.length, 2);
    assert.deepEqual(input.rules[0], { id: ruleItems[0].id, name: ruleItems[0].name,
      kind: "filter", source: ruleItems[0].source, enabled: ruleItems[0].enabled });
    assert.equal(input.rules[1].id, null);
    assert.equal(input.rules[1].kind, "vacation");
    ruleRevision += 1;
    ruleItems = input.rules.map((rule, position) => ({ ...rule, id: rule.id ?? VACATION_RULE,
      source: rule.source.replace(/\r\n?/gu, "\n"), position, updatedAt: "2026-09-29T00:00:00Z" }));
    return reply(response, 200, fixtureRules());
  }
  if (request.url?.startsWith("/api/admin/quarantine?") && request.method === "GET") {
    const params = new URL(request.url, "http://127.0.0.1").searchParams;
    assert.equal(params.get("limit"), "50");
    if (params.has("beforeCreatedAt")) {
      assert.equal(params.get("beforeCreatedAt"), "2026-09-28T00:00:00Z");
      assert.equal(params.get("beforeId"), QUARANTINE);
      return reply(response, 200, { limit: 50, hasMore: false, nextBeforeCreatedAt: null, nextBeforeId: null, items: [] });
    }
    return reply(response, 200, { limit: 50, hasMore: true, nextBeforeCreatedAt: "2026-09-28T00:00:00Z", nextBeforeId: QUARANTINE, items: [{
      id: QUARANTINE, messageId: EMAIL, recipient: "fixture@example.test", envelopeSender: "sender@example.test",
      subject: "Fixture quarantine", sender: {}, sizeBytes: "2048", spamScore: 91, spamRules: ["synthetic-rule"], createdAt: "2026-09-28T00:00:00Z",
    }] });
  }
  if (request.url === `/api/admin/quarantine/${QUARANTINE}` && request.method === "GET") {
    return reply(response, 200, { item: {
      id: QUARANTINE, messageId: EMAIL, recipient: "fixture@example.test", envelopeSender: "sender@example.test",
      subject: "Fixture quarantine", sender: {}, sizeBytes: "2048", spamScore: 91, spamRules: ["synthetic-rule"], createdAt: "2026-09-28T00:00:00Z",
    }, content: { textBody: "Safe plain text", htmlBody: "<script>do-not-render</script>", blockedExternalImages: true, preview: "Safe" } });
  }
  if (request.url?.startsWith("/api/events?") && request.method === "GET") {
    const params = new URL(request.url, "http://127.0.0.1").searchParams;
    const monthly = params.get("from") === "2026-09-01T00:00:00.000Z" && params.get("to") === "2026-10-01T00:00:00.000Z";
    const mutationCheck = params.get("from") === "2026-09-28T09:59:59.999Z" && params.get("to") === "2026-09-28T10:00:00.001Z";
    assert.ok(monthly || mutationCheck);
    return reply(response, 200, { events: [fixtureEvent()] });
  }
  if (request.url === "/api/events" && request.method === "POST") {
    const input = await body(request);
    if (input.allDay) {
      assert.deepEqual(input.attendeeUsernames, []);
      assert.equal(input.startsAt, "2026-09-09T15:00:00.000Z");
      assert.equal(input.endsAt, "2026-09-10T15:00:00.000Z");
    } else {
      assert.deepEqual(input.attendeeUsernames, ["guest@example.test"]);
    }
    eventCreateCalls += 1;
    return reply(response, 200, { ...fixtureEvent(), id: CREATED_EVENT, attendeeAddresses: input.attendeeUsernames,
      allDay: input.allDay ?? false, startsAt: input.startsAt, endsAt: input.endsAt });
  }
  if (request.url === `/api/events/${EVENT}` && (request.method === "PUT" || request.method === "DELETE")) {
    const input = await body(request);
    assert.equal(input.expectedRevision, eventRevision);
    if (request.method === "PUT") assert.deepEqual(input.attendeeUsernames, eventAttendees);
    eventMutationCalls += 1;
    eventRevision += 1;
    if (request.method === "DELETE") eventStatus = "cancelled";
    return reply(response, 200, fixtureEvent());
  }
  if (request.url === "/jmap/api" && request.method === "POST") {
    const input = await body(request);
    const methodResponses = input.methodCalls.map(([method, args, id]) => {
      if (method === "Mailbox/get") return [method, { list: args.accountId === SHARED_ACCOUNT
        ? [{ id: SHARED_INBOX, name: "Inbox", role: "inbox", totalEmails: Number(sharedFixtureMailbox === SHARED_INBOX), unreadEmails: 1 }, { id: SHARED_DRAFTS, name: "Drafts", role: "drafts", totalEmails: 0, unreadEmails: 0 }, { id: SHARED_TRASH, name: "Trash", role: "trash", totalEmails: Number(sharedFixtureMailbox === SHARED_TRASH), unreadEmails: 0 }, { id: SHARED_CUSTOM, name: "Team Project", role: null, totalEmails: Number(sharedFixtureMailbox === SHARED_CUSTOM), unreadEmails: 0 }]
        : [
          { id: INBOX, name: "Inbox", role: "inbox", totalEmails: fixturePagination ? PAGED_IDS.length : Number(fixtureMailbox === INBOX), unreadEmails: 1, "x-tastemail-usedBytes": 2097152, "x-tastemail-quotaBytes": 10737418240 },
          { id: DRAFTS, name: "Drafts", role: "drafts", totalEmails: 0, unreadEmails: 0 },
          { id: ARCHIVE, name: "Archive", role: "archive", totalEmails: Number(fixtureMailbox === ARCHIVE), unreadEmails: 0 },
          { id: SPAM, name: "Spam", role: "junk", totalEmails: Number(fixtureMailbox === SPAM), unreadEmails: 0 },
          { id: TRASH, name: "Trash", role: "trash", totalEmails: Number(fixtureMailbox === TRASH), unreadEmails: 0 },
          { id: CUSTOM, name: "Project", role: null, totalEmails: Number(fixtureCustomMembership), unreadEmails: 0 },
          { id: CUSTOM_OTHER, name: "Other Project", role: null, totalEmails: Number(fixtureOtherCustomMembership), unreadEmails: 0 },
        ] }, id];
      if (method === "Identity/get") {
        assert.ok([ACCOUNT, SHARED_ACCOUNT].includes(args.accountId));
        return [method, { list: args.accountId === SHARED_ACCOUNT
          ? [{ id: SHARED_ACCOUNT, email: "team@example.test", name: "Fixture Team", textSignature: "" }]
          : [{ id: ACCOUNT, email: "fixture@example.test", name: "Fixture Sender" },
            { id: ALTERNATE_IDENTITY, email: "alias@example.test", name: "Alias Sender" }] }, id];
      }
      if (method === "Email/query") {
        if (fixturePagination && args.accountId === ACCOUNT && args.filter?.inMailbox === INBOX) {
          assert.equal(args.calculateTotal, true);
          assert.equal(args.limit, 50);
          return [method, { ids: PAGED_IDS.slice(args.position, args.position + args.limit), position: args.position, total: PAGED_IDS.length }, id];
        }
        if (args.sort?.[0]?.isAscending === true) {
          assert.deepEqual(args.sort, [{ property: "receivedAt", isAscending: true }]);
          ascendingSearchCount += 1;
        }
        const methodError = {
          "jmap-forbidden": "forbidden",
          "jmap-account-inaccessible": "accountNotFound",
          "jmap-rate-limit": "rateLimit",
          "jmap-server-fail": "serverFail",
        }[args.filter?.text];
        if (methodError) return ["error", { type: methodError }, id];
        if (args.filter?.text) assert.ok(["한글 special & search", "인프라 예산", "fixture"].includes(args.filter.text));
        if (args.filter?.operator === "AND") {
          const conditions = args.filter.conditions;
          if (conditions[0]?.from) assert.deepEqual(conditions, [{ from: "alice@example.test" }, { hasAttachment: true }]);
           else if (conditions[0]?.to) assert.deepEqual(conditions, [{ to: "fixture@example.test" }, { notKeyword: "$seen" }]);
           else if (conditions[0]?.body) assert.deepEqual(conditions, [{ body: "Synthetic" }, { hasKeyword: "$flagged" }]);
           else if (conditions[0]?.after) assert.deepEqual(conditions, [{ after: "2026-09-01T00:00:00Z" }, { before: "2026-10-01T00:00:00Z" }]);
           else if (conditions[0]?.minSize) assert.deepEqual(conditions, [
             { minSize: 10 * 1024 ** 2 + 1 }, { maxSize: 1024 ** 3 - 1 },
           ]);
          else if (conditions[0]?.inMailbox) {
            assert.ok([INBOX, CUSTOM].includes(conditions[0].inMailbox));
            assert.deepEqual(conditions, [{ inMailbox: conditions[0].inMailbox }, { text: "fixture" }]);
          }
          else if (conditions.length === 2 && conditions[1]?.inMailbox === CUSTOM) assert.deepEqual(conditions, [{ text: "fixture" }, { inMailbox: CUSTOM }]);
          else if (conditions.length === 2 && [DRAFTS, SPAM, TRASH].includes(conditions[1]?.inMailbox)) {
            assert.deepEqual(conditions, [{ text: "fixture" }, { inMailbox: conditions[1].inMailbox }]);
          }
          else if (Object.keys(conditions[0] ?? {}).length === 0) {
            assert.deepEqual(conditions, [{}, { hasAttachment: true }]);
          }
          else assert.deepEqual(conditions, [
            { text: "fixture" }, { inMailbox: INBOX }, { after: "2026-09-01T00:00:00.000Z" }, { hasAttachment: true },
          ]);
        }
        const matches = !(args.accountId === SHARED_ACCOUNT ? sharedFixtureDestroyed : fixtureDestroyed) && (Object.keys(args.filter ?? {}).length === 0 || args.filter?.text || args.filter?.operator === "AND" ||
          args.filter?.inMailbox === (args.accountId === SHARED_ACCOUNT ? sharedFixtureMailbox : fixtureMailbox) ||
          (args.accountId === ACCOUNT && args.filter?.inMailbox === CUSTOM && fixtureCustomMembership) ||
          (args.accountId === ACCOUNT && args.filter?.inMailbox === CUSTOM_OTHER && fixtureOtherCustomMembership));
        return [method, { ids: matches && args.position === 0 ? [EMAIL] : [], position: args.position, total: Number(Boolean(matches)) }, id];
      }
      if (method === "Email/get" && fixturePagination && args.accountId === ACCOUNT && args.ids.every((messageId) => PAGED_IDS.includes(messageId))) {
        return [method, { state: "7", list: args.ids.map((messageId) => ({
          id: messageId, mailboxIds: { [INBOX]: true }, from: [{ name: "Page fixture", email: "page@example.test" }],
          to: [{ email: "fixture@example.test" }], subject: "Page fixture", preview: "Synthetic page",
          receivedAt: "2026-09-28T00:00:00Z", keywords: { $seen: true },
          bodyValues: { "1": { value: "Synthetic page" } }, attachments: [],
        })).reverse() }, id];
      }
      if (method === "Email/get" && selectiveEmailGet && args.accountId === ACCOUNT && args.fetchTextBodyValues === false && args.properties?.includes("preview") && args.ids.includes(EMAIL)) {
        assert.equal(args.fetchTextBodyValues, false);
        assert.equal(args.fetchHTMLBodyValues, false);
        const includeAttachments = args.properties.includes("attachments");
        return [method, { state: "7", list: [{ id: EMAIL, mailboxIds: { [fixtureMailbox]: true }, from: [{ name: "Alice", email: "alice@example.test" }],
           subject: "Fixture", preview: "Synthetic content", receivedAt: "2026-09-28T00:00:00Z",
           keywords: { $seen: fixtureSeen, $flagged: fixtureStarred },
           ...(includeAttachments ? { attachments: [{ blobId: ATTACHMENT, name: "fixture.txt", type: "text/plain", size: 2048, disposition: "attachment", cid: null }] } : {}) }] }, id];
      }
      if (method === "Email/get" && selectiveSharedEmailGet && args.accountId === SHARED_ACCOUNT && args.fetchTextBodyValues === false && args.properties?.includes("preview") && args.ids.includes(EMAIL)) {
        assert.equal(args.fetchTextBodyValues, false);
        assert.equal(args.fetchHTMLBodyValues, false);
        return [method, { state: "7", list: [{ id: EMAIL, from: [{ name: "Alice", email: "alice@example.test" }],
          subject: "Fixture", preview: "Synthetic content", receivedAt: "2026-09-28T00:00:00Z",
          keywords: { $seen: sharedFixtureSeen, $flagged: sharedFixtureStarred } }] }, id];
      }
      if (method === "Email/get" && args.fetchTextBodyValues === true) {
        assert.equal(args.fetchHTMLBodyValues, true);
        for (const property of ["id", "keywords", "receivedAt", "subject", "from", "replyTo", "to", "cc", "bcc", "messageId", "inReplyTo", "references", "preview", "textBody", "htmlBody", "bodyValues", "attachments", "blockedExternalImages"]) {
          assert.ok(args.properties?.includes(property), `Email/get detail requires ${property}`);
        }
      }
      if (method === "Email/get") return [method, { state: "7", list: args.accountId === SHARED_ACCOUNT && args.ids.includes(SHARED_DRAFT) && sharedDraftExists
        ? [{ id: SHARED_DRAFT, mailboxIds: { [SHARED_DRAFTS]: true }, keywords: { $draft: true } }]
        : args.accountId === SHARED_ACCOUNT && args.ids.includes(SHARED_RESAVED_DRAFT) && sharedResavedExists
        ? [{ id: SHARED_RESAVED_DRAFT, mailboxIds: { [SHARED_DRAFTS]: true }, keywords: { $draft: true } }]
        : args.ids.includes(DRAFT)
        ? [{ id: DRAFT, mailboxIds: { [DRAFTS]: true }, keywords: { $draft: true } }]
        : args.ids.includes(EMAIL) && !(args.accountId === SHARED_ACCOUNT ? sharedFixtureDestroyed : fixtureDestroyed) ? [{ id: EMAIL, mailboxIds: args.accountId === SHARED_ACCOUNT ? { [sharedFixtureMailbox]: true } : { [fixtureMailbox]: true, ...(fixtureCustomMembership ? { [CUSTOM]: true } : {}), ...(fixtureOtherCustomMembership ? { [CUSTOM_OTHER]: true } : {}) }, size: EMAIL_SIZE, from: [{ name: "Alice", email: "alice@example.test" }], replyTo: [{ email: "reply@example.test" }], messageId: ["original@example.test"], inReplyTo: ["earlier@example.test"], references: ["root@example.test", "earlier@example.test"], to: [{ email: "fixture@example.test" }], subject: "Fixture", preview: "Synthetic content", receivedAt: "2026-09-28T00:00:00Z", keywords: { $seen: args.accountId === SHARED_ACCOUNT ? sharedFixtureSeen : fixtureSeen, $flagged: args.accountId === SHARED_ACCOUNT ? sharedFixtureStarred : fixtureStarred }, bodyValues: { "1": { value: "Synthetic text only" } }, attachments: [{ blobId: ATTACHMENT, name: "fixture.txt", type: "text/plain", size: 2048, disposition: "attachment", cid: null }] }] : [] }, id];
      if (method === "Email/set") {
        assert.ok([ACCOUNT, SHARED_ACCOUNT].includes(args.accountId));
        if (args.accountId === SHARED_ACCOUNT) {
          if (args.create) {
            const draft = args.create.draft;
            assert.equal(draft.mailboxIds[SHARED_DRAFTS], true);
            assert.equal(draft.keywords.$draft, true);
            assert.equal(draft.from[0].email, "team@example.test");
            if (sharedDraftCreateFails) {
              sharedDraftCreateFails = false;
              return ["error", { type: "serverFail" }, id];
            }
            const createdId = draft.subject === "Shared draft replacement" ? SHARED_RESAVED_DRAFT : SHARED_DRAFT;
            if (createdId === SHARED_RESAVED_DRAFT) sharedResavedExists = true;
            else sharedDraftExists = true;
            return [method, { created: { draft: { id: createdId } }, notCreated: {} }, id];
          }
          if (args.destroy) {
            assert.equal(args.ifInState, "7");
            if (args.destroy[0] === SHARED_DRAFT) {
              assert.deepEqual(args.destroy, [SHARED_DRAFT]);
              sharedDraftCleanupCount += 1;
              sharedDraftExists = false;
              return [method, { destroyed: [SHARED_DRAFT], notDestroyed: {} }, id];
            }
            if (args.destroy[0] === SHARED_RESAVED_DRAFT) {
              sharedResavedCleanupCount += 1;
              sharedResavedExists = false;
              return [method, { destroyed: [SHARED_RESAVED_DRAFT], notDestroyed: {} }, id];
            }
            assert.deepEqual(args.destroy, [EMAIL]);
            assert.equal(sharedFixtureMailbox, SHARED_TRASH);
            if (sharedStaleDestroy) {
              sharedStaleDestroy = false;
              return ["error", { type: "stateMismatch" }, id];
            }
            sharedFixtureDestroyed = true;
            return [method, { destroyed: [EMAIL], notDestroyed: {} }, id];
          }
          const [[messageId, patch]] = Object.entries(args.update);
          assert.equal(messageId, EMAIL);
          if (Object.hasOwn(patch, `mailboxIds/${SHARED_INBOX}`) || Object.hasOwn(patch, `mailboxIds/${SHARED_TRASH}`)) {
            assert.equal(args.ifInState, "7");
            assert.equal(patch[`mailboxIds/${sharedFixtureMailbox}`], false);
            if (sharedStaleMove) {
              sharedStaleMove = false;
              return ["error", { type: "stateMismatch" }, id];
            }
            const destinations = [SHARED_INBOX, SHARED_TRASH, SHARED_CUSTOM].filter((mailboxId) => patch[`mailboxIds/${mailboxId}`] === true);
            assert.equal(destinations.length, 1);
            sharedFixtureMailbox = destinations[0];
          } else if (Object.hasOwn(patch, "keywords/$seen")) {
            assert.deepEqual(patch, { "keywords/$seen": !sharedFixtureSeen });
            sharedFixtureSeen = patch["keywords/$seen"];
          } else {
            assert.deepEqual(patch, { "keywords/$flagged": !sharedFixtureStarred });
            sharedFixtureStarred = patch["keywords/$flagged"];
          }
          return [method, { updated: { [EMAIL]: null }, notUpdated: {} }, id];
        }
        if (args.create) {
          const draft = args.create.draft;
          assert.equal(draft.mailboxIds[DRAFTS], true);
          assert.equal(draft.keywords.$draft, true);
          assert.equal(draft.from[0].email, "fixture@example.test");
          assert.equal(draft.bodyValues.text.isTruncated, false);
          if (draft.subject === "Synthetic HTML draft") {
            assert.deepEqual(draft.textBody, [{ partId: "text", type: "text/plain" }]);
            assert.deepEqual(draft.htmlBody, [{ partId: "html", type: "text/html" }]);
            assert.deepEqual(draft.bodyValues, {
              text: { value: "Synthetic formatted text", isTruncated: false },
              html: { value: "<p>Synthetic <strong>formatted</strong> text</p>", isTruncated: false },
            });
          }
          if (draft.subject === "Synthetic inline metadata draft") {
            assert.deepEqual(draft.attachments, [{
              blobId: ATTACHMENT, name: "inline.png", type: "image/png", size: 2048,
              disposition: "inline", cid: "inline@example.test",
            }]);
            assert.deepEqual(draft.htmlBody, [{ partId: "html", type: "text/html" }]);
          }
          if (draft.subject === "RE: Synthetic self-message") {
            assert.deepEqual(draft.to, [{ email: "fixture@example.test" }]);
            assert.deepEqual(draft.cc, []);
            assert.deepEqual(draft.inReplyTo, ["original@example.test"]);
            assert.deepEqual(draft.references, ["earlier@example.test", "original@example.test"]);
          }
          if (draft.subject === "Synthetic attachment reuse") {
            assert.deepEqual(draft.attachments, [{
              blobId: ATTACHMENT, name: "fixture.txt", type: "text/plain", size: 2048,
              disposition: "attachment", cid: null,
            }]);
          }
          if (draft.subject === "Synthetic uploaded attachment send") {
            assert.deepEqual(draft.attachments, [{
              blobId: `u:${UPLOAD}`, name: "fixture.txt", type: "text/plain", size: 16,
              disposition: "attachment", cid: null,
            }]);
          }
          if (personalDraftFailureType) return [method, { created: {}, notCreated: { draft: { type: personalDraftFailureType } } }, id];
          createdDraftCount += 1;
          return [method, { created: { draft: { id: draft.subject === "Synthetic attachment reuse" ? RESAVED_DRAFT : DRAFT } }, notCreated: {} }, id];
        }
        if (args.destroy) {
          assert.equal(args.ifInState, "7");
          if (args.destroy[0] === DRAFT) {
            cleanedDraftCount += 1;
            return [method, { destroyed: [DRAFT], notDestroyed: {} }, id];
          }
          assert.deepEqual(args.destroy, [EMAIL]);
          assert.equal(fixtureMailbox, TRASH);
          fixtureDestroyed = true;
          return [method, { destroyed: [EMAIL], notDestroyed: {} }, id];
        }
        const [[messageId, patch]] = Object.entries(args.update);
        if (messageId === SERVER_FAIL_EMAIL) return [method, { updated: {}, notUpdated: { [messageId]: { type: "serverFail" } } }, id];
        if (messageId !== EMAIL) return [method, { updated: {}, notUpdated: { [messageId]: { type: "notFound" } } }, id];
        if (Object.hasOwn(patch, "keywords/$seen")) fixtureSeen = patch["keywords/$seen"];
        if (Object.hasOwn(patch, "keywords/$flagged")) fixtureStarred = patch["keywords/$flagged"];
        const targets = Object.entries(patch).filter(([key, value]) => key.startsWith("mailboxIds/") && value === true);
        if (targets.length) {
          assert.equal(args.ifInState, "7");
          if (targets[0][0] !== `mailboxIds/${CUSTOM}` && fixtureMailbox !== CUSTOM) assert.equal(Object.hasOwn(patch, `mailboxIds/${CUSTOM}`), false);
          if (staleMove > 0) {
            staleMove -= 1;
            return ["error", { type: "stateMismatch" }, id];
          }
          assert.equal(targets.length, 1);
          assert.equal(patch[`mailboxIds/${fixtureMailbox}`], fixtureMailbox === CUSTOM && targets[0][0] === `mailboxIds/${CUSTOM}` ? undefined : false);
          if (Object.hasOwn(patch, `mailboxIds/${CUSTOM}`)) fixtureCustomMembership = patch[`mailboxIds/${CUSTOM}`];
          if (Object.hasOwn(patch, `mailboxIds/${CUSTOM_OTHER}`)) fixtureOtherCustomMembership = patch[`mailboxIds/${CUSTOM_OTHER}`];
          fixtureMailbox = targets[0][0].slice(11);
        }
        return [method, { updated: { [EMAIL]: null }, notUpdated: {} }, id];
      }
      if (method === "EmailSubmission/get") {
        assert.deepEqual(args.properties, ["id", "sendAt", "undoStatus", "envelope"]);
        const sendAt = args.accountId === SHARED_ACCOUNT ? sharedPendingSendAt : personalPendingSendAt;
        assert.ok(args.accountId === ACCOUNT || args.accountId === SHARED_ACCOUNT);
        if (saturatedSubmissionList && args.accountId === ACCOUNT) {
          return [method, { list: Array.from({ length: 500 }, (_, index) => ({ id: String(index), undoStatus: "sent" })) }, id];
        }
        return [method, { list: sendAt ? [{ id: SUBMISSION, sendAt, undoStatus: "pending",
          envelope: { rcptTo: [{ email: "recipient@example.test" }] } }] : [] }, id];
      }
      if (method === "EmailSubmission/set") {
        if (args.update) {
          assert.deepEqual(args.update, { [SUBMISSION]: { undoStatus: "canceled" } });
          const sendAt = args.accountId === SHARED_ACCOUNT ? sharedPendingSendAt : personalPendingSendAt;
          if (!sendAt) return [method, { updated: {}, notUpdated: { [SUBMISSION]: { type: "cannotUnsend" } } }, id];
          if (args.accountId === SHARED_ACCOUNT) sharedPendingSendAt = null;
          else personalPendingSendAt = null;
          return [method, { updated: { [SUBMISSION]: null }, notUpdated: {} }, id];
        }
        if (args.accountId === SHARED_ACCOUNT) {
          assert.equal(args.create.send.emailId, SHARED_DRAFT);
          assert.equal(args.create.send.identityId, SHARED_ACCOUNT);
          assert.equal(args.create.send.envelope.mailFrom.email, "team@example.test");
          assert.deepEqual(args.create.send.envelope.mailFrom.parameters, expectedSharedScheduleAtUtc ? { HOLDUNTIL: expectedSharedScheduleAtUtc } : undefined);
          assert.deepEqual(args.create.send.envelope.rcptTo, [{ email: "recipient@example.test" }]);
          if (sharedSubmissionMode === "rejected") return [method, { created: {}, notCreated: { send: { type: "forbidden" } } }, id];
          if (sharedSubmissionMode === "uncertain") return ["error", { type: "serverFail" }, id];
          sharedSubmissionCount += 1;
          if (expectedSharedScheduleAtUtc) sharedPendingSendAt = expectedSharedScheduleAtUtc;
          return [method, { created: { send: { id: SUBMISSION } }, notCreated: {} }, id];
        }
        assert.equal(args.accountId, ACCOUNT);
        assert.deepEqual(args.onSuccessDestroyEmail, ["send"]);
        assert.equal(args.create.send.emailId, DRAFT);
        assert.equal(args.create.send.identityId, ACCOUNT);
        assert.equal(args.create.send.envelope.mailFrom.email, "fixture@example.test");
        assert.deepEqual(args.create.send.envelope.mailFrom.parameters, expectedScheduleAtUtc ? { HOLDUNTIL: expectedScheduleAtUtc } : undefined);
        assert.deepEqual(args.create.send.envelope.rcptTo, [{ email: expectSelfReply ? "fixture@example.test" : "recipient@example.test" }]);
        if (submissionMode === "rejected") return [method, { created: {}, notCreated: { send: { type: "forbidden" } } }, id];
        if (["invalidProperties", "invalidEmail", "overQuota", "serverFail"].includes(submissionMode)) {
          return [method, { created: {}, notCreated: { send: { type: submissionMode } } }, id];
        }
        if (submissionMode === "uncertain") return ["error", { type: "serverFail" }, id];
        queuedSubmissionCount += 1;
        if (expectedScheduleAtUtc) personalPendingSendAt = expectedScheduleAtUtc;
        return [method, { created: { send: { id: SUBMISSION } }, notCreated: {} }, id];
      }
      return ["error", { type: "unknownMethod" }, id];
    });
    return reply(response, 200, { methodResponses });
  }
  return reply(response, 404, { type: "notFound" });
});

async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  return server.address().port;
}

async function freePort() {
  const temporary = createServer();
  const port = await listen(temporary);
  await new Promise((resolveClose) => temporary.close(resolveClose));
  return port;
}

let app;

try {
  const apiPort = await listen(api);
  const webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  app = spawn(process.execPath, [resolve(projectRoot, "node_modules/next/dist/bin/next"), "start", "-p", String(webPort)], {
    cwd: projectRoot,
    env: { ...process.env, GXWEBMAIL_DATA_MODE: "live", TASTEMAIL_API_URL: `http://127.0.0.1:${apiPort}` },
    stdio: "ignore",
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (app.exitCode !== null) throw new Error("Next.js exited before it became ready");
    try {
      const response = await fetch(`${origin}/api/mail/session`);
      if (response.status === 401) { ready = true; break; }
    } catch {}
    await delay(100);
  }
  if (!ready) throw new Error("Next.js did not become ready");

  const homeHtml = await (await fetch(`${origin}/ko`)).text();
  assert.equal(homeHtml.includes("[초대] 아틀라스 3차 스프린트 리뷰 · 인프라 증설 안건 포함"), false);
  const anonymousLogin = await fetch(`${origin}/ko/login`);
  assert.equal(anonymousLogin.status, 200);
  const loginHtml = await anonymousLogin.text();
  assert.equal(loginHtml.includes('name="username"'), true);
  assert.equal(loginHtml.includes('name="password"'), true);
  const renderedLoginHtml = loginHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "");
  assert.equal(renderedLoginHtml.includes('2단계 인증이 활성화된 계정입니다'), false);
  const setupTitles = {
    ko: "TASTEMAIL 최초 설치", en: "TASTEMAIL initial setup", de: "TASTEMAIL-Ersteinrichtung",
    es: "Configuración inicial de TASTEMAIL", fr: "Configuration initiale de TASTEMAIL",
    it: "Configurazione iniziale di TASTEMAIL", pt: "Configuração inicial do TASTEMAIL",
    ja: "TASTEMAIL初期設定", zh: "TASTEMAIL 初始设置", "zh-hant": "TASTEMAIL 初始設定",
  };
  for (const locale of LOCALES) {
    const setupPage = await fetch(`${origin}/${locale}/setup`);
    assert.equal(setupPage.status, 200);
    const renderedSetupHtml = (await setupPage.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "");
    assert.match(renderedSetupHtml, new RegExp(`<html\\b[^>]*lang="${locale}"`, "u"));
    assert.ok(renderedSetupHtml.includes(setupTitles[locale]), `${locale} must render its localized live setup title`);
    assert.equal(renderedSetupHtml.includes("Mailwave 메일 서버"), false, `${locale} must not render the mock setup wizard`);
  }
  const liveApprovalsHtml = await (await fetch(`${origin}/ko/approvals`)).text();
  assert.equal(liveApprovalsHtml.includes("2026 상반기 클라우드 인프라 증설 예산 승인 요청"), false);

  const healthy = await fetch(`${origin}/api/mail/health`);
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), { status: "ok" });
  for (const [upstreamStatus, expectedStatus, expectedCode] of [
    [401, 401, "unauthorized"], [403, 403, "forbidden"],
    [429, 429, "rateLimited"], [404, 502, "unavailable"], [503, 503, "retryable"],
  ]) {
    healthStatus = upstreamStatus;
    const unhealthy = await fetch(`${origin}/api/mail/health`);
    assert.equal(unhealthy.status, expectedStatus);
    assert.equal((await unhealthy.json()).status, expectedCode);
  }
  healthStatus = 200;

  const unauthenticated = await fetch(`${origin}/api/mail/messages?folder=inbox`);
  assert.equal(unauthenticated.status, 401);
  const unauthenticatedDetail = await fetch(`${origin}/api/mail/messages/${EMAIL}`);
  assert.equal(unauthenticatedDetail.status, 401);
  const unauthenticatedMailboxes = await fetch(`${origin}/api/mail/mailboxes`);
  assert.equal(unauthenticatedMailboxes.status, 401);
  const unauthenticatedSearch = await fetch(`${origin}/api/mail/search?q=fixture`);
  assert.equal(unauthenticatedSearch.status, 401);
  const unauthenticatedContacts = await fetch(`${origin}/api/mail/contacts`);
  assert.equal(unauthenticatedContacts.status, 401);
  const unauthenticatedShared = await fetch(`${origin}/api/mail/shared-mailboxes`);
  assert.equal(unauthenticatedShared.status, 401);
  const unauthenticatedApprovals = await fetch(`${origin}/api/mail/approvals`);
  assert.equal(unauthenticatedApprovals.status, 401);
  const unauthenticatedRules = await fetch(`${origin}/api/mail/rules`);
  assert.equal(unauthenticatedRules.status, 401);
  const unauthenticatedRuleCheck = await fetch(`${origin}/api/mail/rules/check`, {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ intent: "validate", source: "keep;" }),
  });
  assert.equal(unauthenticatedRuleCheck.status, 401);
  const noOriginRuleUpdate = await fetch(`${origin}/api/mail/rules`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: 2, rules: [] }),
  });
  assert.equal(noOriginRuleUpdate.status, 403);
  const unauthenticatedQuarantine = await fetch(`${origin}/api/mail/quarantine`);
  assert.equal(unauthenticatedQuarantine.status, 401);
  const unauthenticatedQuarantineDetail = await fetch(`${origin}/api/mail/quarantine/${QUARANTINE}`);
  assert.equal(unauthenticatedQuarantineDetail.status, 401);
  const unauthenticatedSharedMessages = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}`);
  assert.equal(unauthenticatedSharedMessages.status, 401);
  const unauthenticatedSharedDetail = await fetch(`${origin}/api/mail/shared-messages/${EMAIL}?accountId=${SHARED_ACCOUNT}`);
  assert.equal(unauthenticatedSharedDetail.status, 401);
  const eventQuery = "from=2026-09-01T00%3A00%3A00.000Z&to=2026-10-01T00%3A00%3A00.000Z";
  const unauthenticatedEvents = await fetch(`${origin}/api/mail/events?${eventQuery}`);
  assert.equal(unauthenticatedEvents.status, 401);
  const unauthenticatedFlag = await fetch(`${origin}/api/mail/flags`, { method: "PATCH", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ messageId: EMAIL, flag: "seen", value: true }) });
  assert.equal(unauthenticatedFlag.status, 401);
  const missingOriginCompose = await fetch(`${origin}/api/mail/compose`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(missingOriginCompose.status, 403);
  const missingOriginUpload = await fetch(`${origin}/api/mail/upload?name=fixture.txt`, { method: "POST", headers: { "content-type": "text/plain" }, body: "fixture" });
  assert.equal(missingOriginUpload.status, 403);
  const unauthenticatedAttachment = await fetch(`${origin}/api/mail/attachments?blobId=${encodeURIComponent(ATTACHMENT)}`);
  assert.equal(unauthenticatedAttachment.status, 401);
  const invalidAttachment = await fetch(`${origin}/api/mail/attachments?blobId=not-a-message-blob`);
  assert.equal(invalidAttachment.status, 400);
  const invalidSharedAttachment = await fetch(`${origin}/api/mail/attachments?blobId=${encodeURIComponent(ATTACHMENT)}&accountId=not-an-id`);
  assert.equal(invalidSharedAttachment.status, 400);

  async function loginAttempt(username, password = "fixture-only", mfaCode) {
    const response = await fetch(`${origin}/api/mail/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ username, password, ...(mfaCode ? { mfaCode } : {}) }),
    });
    return { response, payload: await response.json() };
  }
  const missingOriginLogin = await fetch(`${origin}/api/mail/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "fixture@example.test", password: "fixture-only" }),
  });
  assert.equal(missingOriginLogin.status, 403);
  assert.equal((await missingOriginLogin.json()).status, "forbidden");
  for (const [username, code, httpStatus, status] of [
    ["fixture@example.test", undefined, 401, "unauthorized"],
    ["mfa@example.test", undefined, 401, "mfaRequired"],
    ["mfa@example.test", "000000", 401, "invalidMfaCode"],
    ["forbidden@example.test", undefined, 403, "forbidden"],
    ["limited@example.test", undefined, 429, "rateLimited"],
    ["unavailable@example.test", undefined, 503, "retryable"],
  ]) {
    const result = await loginAttempt(username, username === "fixture@example.test" ? "wrong" : "fixture-only", code);
    assert.equal(result.response.status, httpStatus);
    assert.equal(result.payload.status, status);
    assert.equal(result.response.headers.get("set-cookie"), null);
  }
  const mfaSuccess = await loginAttempt("mfa@example.test", "fixture-only", "123456");
  assert.equal(mfaSuccess.response.status, 200);
  assert.equal(mfaSuccess.payload.status, "authenticated");
  const forwardedHttpsLogin = await fetch(`${origin}/api/mail/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: origin.replace("http:", "https:"), "x-forwarded-proto": "https" },
    body: JSON.stringify({ username: "fixture@example.test", password: "fixture-only" }),
  });
  assert.equal(forwardedHttpsLogin.status, 200);
  assert.match(forwardedHttpsLogin.headers.get("set-cookie") ?? "", /; Secure\b/u);
  const malformedSession = await fetch(`${origin}/api/mail/session`, {
    headers: { cookie: "gxwebmail_tastemail_session=malformed-session-token" },
  });
  assert.equal(malformedSession.status, 502);
  assert.equal((await malformedSession.json()).status, "unavailable");
  const incompleteCookie = "gxwebmail_tastemail_session=incomplete-session-token";
  const incompleteSession = await fetch(`${origin}/api/mail/session`, { headers: { cookie: incompleteCookie } });
  assert.equal(incompleteSession.status, 502);
  assert.equal((await incompleteSession.json()).status, "unavailable");
  const incompleteLoginPage = await fetch(`${origin}/ko/login`, { headers: { cookie: incompleteCookie }, redirect: "manual" });
  assert.equal(incompleteLoginPage.status, 200, "an incomplete session must not redirect away from login");
  for (const path of ["/ko/settings", "/ko/admin"]) {
    const guardedPage = await fetch(`${origin}${path}`, { headers: { cookie: incompleteCookie } });
    assert.equal(guardedPage.status, 200);
    assert.match(await guardedPage.text(), /서버 응답을 처리할 수 없습니다/u);
  }

  for (const [tokenValue, httpStatus, status] of [
    ["expired-token", 401, "unauthorized"],
    ["forbidden-token", 403, "forbidden"],
    ["limited-token", 429, "rateLimited"],
    ["unavailable-token", 503, "retryable"],
  ]) {
    const testCookie = `gxwebmail_tastemail_session=${tokenValue}`;
    for (const path of ["/ko/settings", "/ko/admin"]) {
      const guardedPage = await fetch(`${origin}${path}`, { headers: { cookie: testCookie }, redirect: "manual" });
      if (tokenValue === "expired-token") {
        assert.equal(guardedPage.status, 307);
        assert.equal(guardedPage.headers.get("location"), "/ko/login");
      } else {
        assert.equal(guardedPage.status, 200);
        const pageHtml = await guardedPage.text();
        const message = status === "forbidden" ? "이 정보에 접근할 권한이 없습니다."
          : status === "rateLimited" ? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
            : "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
        assertSystemErrorToast(pageHtml, message, `${path} ${status}`);
      }
    }
    if (tokenValue === "expired-token") {
      const invalidSession = await fetch(`${origin}/api/mail/session`, { headers: { cookie: testCookie } });
      assert.equal(invalidSession.status, 401);
      assert.equal((await invalidSession.json()).status, "unauthorized");
      assert.match(invalidSession.headers.get("set-cookie") ?? "", /^gxwebmail_tastemail_session=;/u);
    }
    const messages = await fetch(`${origin}/api/mail/messages?folder=inbox`, { headers: { cookie: testCookie } });
    assert.equal(messages.status, httpStatus);
    assert.equal((await messages.json()).status, status);
    const searchFailure = await fetch(`${origin}/api/mail/search?q=fixture`, { headers: { cookie: testCookie } });
    assert.equal(searchFailure.status, httpStatus);
    assert.equal((await searchFailure.json()).status, status);
    const contactsFailure = await fetch(`${origin}/api/mail/contacts`, { headers: { cookie: testCookie } });
    assert.equal(contactsFailure.status, httpStatus);
    assert.equal((await contactsFailure.json()).status, status);
    const sharedFailure = await fetch(`${origin}/api/mail/shared-mailboxes`, { headers: { cookie: testCookie } });
    assert.equal(sharedFailure.status, httpStatus);
    assert.equal((await sharedFailure.json()).status, status);
    const approvalsFailure = await fetch(`${origin}/api/mail/approvals`, { headers: { cookie: testCookie } });
    assert.equal(approvalsFailure.status, httpStatus);
    assert.equal((await approvalsFailure.json()).status, status);
    const rulesFailure = await fetch(`${origin}/api/mail/rules`, { headers: { cookie: testCookie } });
    assert.equal(rulesFailure.status, httpStatus);
    assert.equal((await rulesFailure.json()).status, status);
    for (const [path, method, bodyValue] of [
      ["/api/mail/rules/check", "POST", { intent: "validate", source: "keep;" }],
      ["/api/mail/rules", "PUT", { expectedRevision: 2, rules: [] }],
    ]) {
      const failure = await fetch(`${origin}${path}`, {
        method, headers: { cookie: testCookie, origin, "content-type": "application/json" },
        body: JSON.stringify(bodyValue),
      });
      assert.equal(failure.status, httpStatus);
      assert.equal((await failure.json()).status, status);
    }
    const quarantineFailure = await fetch(`${origin}/api/mail/quarantine`, { headers: { cookie: testCookie } });
    assert.equal(quarantineFailure.status, httpStatus);
    assert.equal((await quarantineFailure.json()).status, status);
    const eventsFailure = await fetch(`${origin}/api/mail/events?${eventQuery}`, { headers: { cookie: testCookie } });
    assert.equal(eventsFailure.status, httpStatus);
    assert.equal((await eventsFailure.json()).status, status);
    const attachmentFailure = await fetch(`${origin}/api/mail/attachments?blobId=${encodeURIComponent(ATTACHMENT)}`, { headers: { cookie: testCookie } });
    assert.equal(attachmentFailure.status, httpStatus);
    assert.equal((await attachmentFailure.json()).status, status);
  }

  const missingSessionAttachment = await fetch(`${origin}/api/mail/attachments?blobId=${encodeURIComponent(ATTACHMENT)}`, {
    headers: { cookie: "gxwebmail_tastemail_session=missing-session-token" },
  });
  assert.equal(missingSessionAttachment.status, 502);
  assert.equal((await missingSessionAttachment.json()).status, "unavailable");

  const login = await fetch(`${origin}/api/mail/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "fixture@example.test", password: "fixture-only" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("gxwebmail_tastemail_session="));
  assert.equal(JSON.stringify(await login.json()).includes(TOKEN), false);

  const session = await fetch(`${origin}/api/mail/session`, { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { mode: "live", authenticated: true, username: "fixture@example.test", accountId: ACCOUNT });
  for (const path of ["/ko/admin", "/ko/admin/onboarding", "/ko/admin/system"]) {
    const adminPage = await fetch(`${origin}${path}`, { headers: { cookie } });
    assert.equal(adminPage.status, 200);
    const renderedAdminHtml = (await adminPage.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "");
    assert.match(renderedAdminHtml, /이 정보에 접근할 권한이 없습니다/u,
      `${path} must deny a non-admin session using upstream authorization`);
    assert.equal(renderedAdminHtml.includes('admin-mobile-navigation'), false,
      `${path} must not expose the administrator shell to a denied account`);
    assert.equal(renderedAdminHtml.includes(TOKEN), false, `${path} must not expose the session token`);
  }
  const deniedAdminRead = await fetch(`${origin}/api/mail/admin/operations`, { headers: { cookie } });
  assert.equal(deniedAdminRead.status, 403);
  assert.deepEqual(await deniedAdminRead.json(), { status: "forbidden" });
  adminAccessStatus = 200;
  try {
    const allowedAdminRead = await fetch(`${origin}/api/mail/admin/operations`, { headers: { cookie } });
    assert.equal(allowedAdminRead.status, 200);
    assert.deepEqual(await allowedAdminRead.json(), adminFixture, "administrator BFF must project only public contract fields");
    const allowedAdminPage = await fetch(`${origin}/ko/admin`, { headers: { cookie } });
    assert.equal(allowedAdminPage.status, 200);
    const html = (await allowedAdminPage.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "");
    assert.match(html, /admin-fixture\.example\.test/u, "live SSR must render the authorized operations response");
    assert.match(html, /admin-mobile-navigation/u, "the authorized page must inherit AdminShell");
    assert.equal(html.includes("관리자 콘솔이 아직 연결되지 않았습니다"), false);
    assert.equal(html.includes("must-not-project-admin-extra"), false);
    assert.equal(html.includes(TOKEN), false);
  } finally { adminAccessStatus = 403; }
  jmapSessionReads = 0;
  const liveAccountPage = await fetch(`${origin}/ko/settings/account`, { headers: { cookie } });
  assert.equal(liveAccountPage.status, 200);
  const liveAccountHtml = (await liveAccountPage.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "");
  assert.match(liveAccountHtml, /2 MiB \/ 10 GiB/u, "authenticated mailbox quota must be present in the server-rendered sidebar");
  assert.match(liveAccountHtml, /<button\b[^>]*aria-label="프로필"[^>]*>[\s\S]*?aria-hidden="true">F<\/span>[\s\S]*?<\/button>/u,
    "the profile avatar must use the authenticated username on the server render");
  assert.equal(liveAccountHtml.includes(TOKEN), false);
  assert.equal(jmapSessionReads, 1, "a protected SSR render must reuse the verified JMAP session for its mailbox summary");
  jmapSessionReads = 0;
  const liveInboxPage = await fetch(`${origin}/ko`, { headers: { cookie } });
  assert.equal(liveInboxPage.status, 200);
  const liveInboxHtml = (await liveInboxPage.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "");
  assert.match(liveInboxHtml, /2 MiB \/ 10 GiB/u, "inbox quota must be visible in the first server-rendered HTML");
  assert.equal(liveInboxHtml.includes(TOKEN), false);
  assert.equal(jmapSessionReads, 1, "the inbox SSR render must request the JMAP session only once");
  const secondLogin = await loginAttempt("second@example.test");
  assert.equal(secondLogin.response.status, 200);
  const secondCookie = secondLogin.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(secondCookie?.startsWith("gxwebmail_tastemail_session="));
  const secondSession = await fetch(`${origin}/api/mail/session`, { headers: { cookie: secondCookie } });
  assert.equal(secondSession.status, 200);
  assert.deepEqual(await secondSession.json(), { mode: "live", authenticated: true, username: "second@example.test", accountId: SECONDARY_ACCOUNT });
  const secondPage = await fetch(`${origin}/ko/settings/account`, { headers: { cookie: secondCookie } });
  assert.equal(secondPage.status, 200);
  const secondHtml = (await secondPage.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "");
  assert.match(secondHtml, /6 MiB \/ 4 GiB/u, "the second account must render its own mailbox quota");
  assert.equal(/<button\b[^>]*aria-label="프로필"[^>]*>[\s\S]*?aria-hidden="true">S<\/span>[\s\S]*?<\/button>/u.test(secondHtml), true,
    "the second account must render its own avatar initial");
  assert.equal(secondHtml.includes("fixture@example.test"), false, "the prior account identity must not appear in the second SSR HTML");
  assert.equal(secondHtml.includes("2 MiB / 10 GiB"), false, "the prior account quota must not appear in the second SSR HTML");
  const sameUsernameLogin = await loginAttempt("fixture@example.test", "fixture-secondary");
  assert.equal(sameUsernameLogin.response.status, 200);
  const sameUsernameCookie = sameUsernameLogin.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(sameUsernameCookie?.startsWith("gxwebmail_tastemail_session="));
  const sameUsernameSession = await fetch(`${origin}/api/mail/session`, { headers: { cookie: sameUsernameCookie } });
  assert.equal(sameUsernameSession.status, 200);
  assert.deepEqual(await sameUsernameSession.json(), { mode: "live", authenticated: true, username: "fixture@example.test", accountId: SECONDARY_ACCOUNT });
  const sameUsernamePage = await fetch(`${origin}/ko/settings/account`, { headers: { cookie: sameUsernameCookie } });
  assert.equal(sameUsernamePage.status, 200);
  const sameUsernameHtml = (await sameUsernamePage.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "");
  assert.match(sameUsernameHtml, /6 MiB \/ 4 GiB/u, "the same username with a new account ID must render the new account quota");
  assert.equal(sameUsernameHtml.includes("2 MiB / 10 GiB"), false, "the same username must not preserve the previous account quota");
  const firstAccountAgain = await fetch(`${origin}/ko/settings/account`, { headers: { cookie } });
  assert.equal(firstAccountAgain.status, 200);
  const firstHtmlAgain = (await firstAccountAgain.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "");
  assert.match(firstHtmlAgain, /2 MiB \/ 10 GiB/u, "the first account must keep its own quota after a second account render");
  assert.equal(/<button\b[^>]*aria-label="프로필"[^>]*>[\s\S]*?aria-hidden="true">F<\/span>[\s\S]*?<\/button>/u.test(firstHtmlAgain), true,
    "the first account must keep its own avatar initial after a second account render");
  assert.equal(firstHtmlAgain.includes("second@example.test"), false, "the second account identity must not leak into the first SSR HTML");
  for (const locale of LOCALES.slice(1)) {
    jmapSessionReads = 0;
    const response = await fetch(`${origin}/${locale}`, { headers: { cookie } });
    assert.equal(response.status, 200, `${locale} live inbox must accept the authenticated session`);
    const html = await response.text();
    const renderedHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "");
    assert.match(renderedHtml, new RegExp(`<html\\b[^>]*lang="${locale}"`, "u"), `${locale} must retain its locale in SSR HTML`);
    assert.match(renderedHtml, /2 MiB \/ 10 GiB/u, `${locale} must render live mailbox quota in the first HTML`);
    assert.equal(renderedHtml.includes("[초대] 아틀라스 3차 스프린트 리뷰"), false, `${locale} must not render mock mail`);
    assert.equal(html.includes(TOKEN), false, `${locale} must not serialize the session token`);
    assert.equal(jmapSessionReads, 1, `${locale} SSR render must reuse its verified JMAP session`);
  }
  const accountPreferences = await fetch(`${origin}/api/mail/preferences`, { headers: { cookie } });
  assert.equal(accountPreferences.status, 200);
  assert.deepEqual((await accountPreferences.json()).identities.map(({ address, displayName, isDefault }) => ({ address, displayName, isDefault })), [
    { address: "fixture@example.test", displayName: "Fixture Sender", isDefault: true },
    { address: "alias@example.test", displayName: "Alias Sender", isDefault: false },
  ]);
  const suggestions = await fetch(`${origin}/api/mail/contact-suggestions?q=fixture`, { headers: { cookie } });
  assert.equal(suggestions.status, 200);
  assert.deepEqual(await suggestions.json(), { suggestions: [
    { name: "Fixture Contact", email: "contact@example.test", interactionCount: 2, lastUsedAt: "2026-09-28T00:00:00Z", saved: true },
  ] });
  const composeOptions = await fetch(`${origin}/api/mail/compose`, { headers: { cookie } });
  assert.equal(composeOptions.status, 200);
  assert.deepEqual(await composeOptions.json(), {
    from: "fixture@example.test", signature: "Synthetic sign-off", signatureHtml: "<strong>Synthetic sign-off</strong>", signatureFormat: "text/html",
    maxAttachmentBytes: 10_485_760, maxDelayedSend: 604_800, availableFrom: ["fixture@example.test", "alias@example.test"],
  });
  const chosenComposeOptions = await fetch(`${origin}/api/mail/compose?fromAddress=fixture%40example.test`, { headers: { cookie } });
  assert.equal(chosenComposeOptions.status, 200);
  assert.equal((await chosenComposeOptions.json()).signatureFormat, "text/html");
  const aliasComposeOptions = await fetch(`${origin}/api/mail/compose?fromAddress=alias%40example.test`, { headers: { cookie } });
  assert.equal(aliasComposeOptions.status, 200);
  assert.deepEqual(await aliasComposeOptions.json(), {
    from: "alias@example.test", signature: "Alias sign-off", signatureHtml: "<em>Alias sign-off</em>", signatureFormat: "text/html",
    maxAttachmentBytes: 10_485_760, maxDelayedSend: 604_800, availableFrom: ["fixture@example.test", "alias@example.test"],
  });
  const unknownComposeOptions = await fetch(`${origin}/api/mail/compose?fromAddress=unknown%40example.test`, { headers: { cookie } });
  assert.equal(unknownComposeOptions.status, 403);
  assert.equal((await unknownComposeOptions.json()).status, "forbidden");
  assert.equal((await fetch(`${origin}/api/mail/compose?fromAddress=invalid`, { headers: { cookie } })).status, 400);
  const composeInput = {
    to: ["recipient@example.test"], cc: [], bcc: [], subject: "Synthetic draft", body: "Fixture body", attachments: [],
  };
  const missingRecipient = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "send", ...composeInput, to: [] }),
  });
  assert.equal(missingRecipient.status, 400);
  assert.deepEqual(await missingRecipient.json(), { status: "recipient_required" });
  for (const [input, field] of [
    [{ to: ["not-an-address"] }, "to"],
    [{ inReplyTo: ["<invalid-message-id>"] }, "inReplyTo"],
    [{ references: ["bad message id"] }, "references"],
    [{ attachments: [{ blobId: "invalid", name: "fixture.txt", type: "text/plain", size: 1 }] }, "attachments"],
  ]) {
    const invalidReply = await fetch(`${origin}/api/mail/compose`, {
      method: "POST", headers: { cookie, "content-type": "application/json", origin },
      body: JSON.stringify({ action: "send", ...composeInput, ...input }),
    });
    assert.equal(invalidReply.status, 400);
    assert.deepEqual(await invalidReply.json(), { status: "invalid_request", field });
  }
  const oversizedDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "draft", ...composeInput,
      attachments: [{ blobId: `u:${UPLOAD}`, name: "oversized.txt", type: "text/plain", size: 10_485_761 }] }),
  });
  assert.equal(oversizedDraft.status, 413);
  assert.deepEqual(await oversizedDraft.json(), { status: "tooLarge" });
  assert.equal(createdDraftCount, 0, "oversized attachment metadata must be rejected before Email/set");
  const saveDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "draft", ...composeInput }),
  });
  assert.equal(saveDraft.status, 200);
  assert.deepEqual(await saveDraft.json(), { status: "saved", draftId: DRAFT, previousDraftCleanupConfirmed: true });
  const sendMail = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "send", ...composeInput }),
  });
  assert.equal(sendMail.status, 200);
  assert.deepEqual(await sendMail.json(), { status: "submitted", previousDraftCleanupConfirmed: true });
  submissionMode = "rejected";
  const rejectedSend = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "send", ...composeInput }),
  });
  assert.equal(rejectedSend.status, 403);
  assert.equal((await rejectedSend.json()).status, "forbidden");
  assert.equal(cleanedDraftCount, 1);
  submissionMode = "uncertain";
  const uncertainSend = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "send", ...composeInput }),
  });
  assert.equal(uncertainSend.status, 409);
  assert.equal((await uncertainSend.json()).status, "submission_uncertain");
  assert.equal(cleanedDraftCount, 1);
  assert.equal(createdDraftCount, 4);
  assert.equal(queuedSubmissionCount, 1);
  const resavedAttachmentDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({
      action: "draft", ...composeInput, to: [], subject: "Synthetic attachment reuse",
      previousDraftId: DRAFT,
      attachments: [{ blobId: ATTACHMENT, name: "fixture.txt", type: "text/plain", size: 2048 }],
    }),
  });
  assert.equal(resavedAttachmentDraft.status, 200);
  assert.deepEqual(await resavedAttachmentDraft.json(), {
    status: "saved", draftId: RESAVED_DRAFT, previousDraftCleanupConfirmed: true,
  });
  assert.equal(createdDraftCount, 5);
  assert.equal(cleanedDraftCount, 2);
  const uploadAttachment = await fetch(`${origin}/api/mail/upload?name=fixture.txt`, {
    method: "POST", headers: { cookie, origin, "content-type": "text/plain" }, body: "synthetic-upload",
  });
  assert.equal(uploadAttachment.status, 201);
  assert.deepEqual(await uploadAttachment.json(), { blobId: `u:${UPLOAD}`, name: "fixture.txt", type: "text/plain", size: 16 });
  submissionMode = "success";
  const sendUploadedAttachment = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({
      action: "send", ...composeInput, subject: "Synthetic uploaded attachment send",
      attachments: [{ blobId: `u:${UPLOAD}`, name: "fixture.txt", type: "text/plain", size: 16 }],
    }),
  });
  assert.equal(sendUploadedAttachment.status, 200);
  assert.equal((await sendUploadedAttachment.json()).status, "submitted");
  assert.equal(createdDraftCount, 6);
  assert.equal(queuedSubmissionCount, 2);
  expectSelfReply = true;
  const selfReply = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({
      action: "send", ...composeInput, to: ["fixture@example.test"],
      subject: "RE: Synthetic self-message", body: "Synthetic reply",
      inReplyTo: ["original@example.test"],
      references: ["earlier@example.test", "original@example.test"],
    }),
  });
  assert.equal(selfReply.status, 200);
  assert.equal((await selfReply.json()).status, "submitted");
  assert.equal(createdDraftCount, 7);
  assert.equal(queuedSubmissionCount, 3);
  expectSelfReply = false;
  for (const [failureType, expectedHttp, expectedStatus] of [
    ["invalidProperties", 400, "invalid_request"],
    ["overQuota", 507, "overQuota"],
  ]) {
    personalDraftFailureType = failureType;
    const rejectedDraft = await fetch(`${origin}/api/mail/compose`, {
      method: "POST", headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ action: "draft", ...composeInput }),
    });
    assert.equal(rejectedDraft.status, expectedHttp);
    assert.equal((await rejectedDraft.json()).status, expectedStatus);
  }
  personalDraftFailureType = null;
  const cleanedBeforeExplicitRejection = cleanedDraftCount;
  for (const [failureType, expectedHttp, expectedStatus] of [
    ["invalidProperties", 400, "invalid_request"],
    ["invalidEmail", 400, "invalid_request"],
    ["overQuota", 507, "overQuota"],
    ["serverFail", 503, "retryable"],
  ]) {
    submissionMode = failureType;
    const rejectedSubmission = await fetch(`${origin}/api/mail/compose`, {
      method: "POST", headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ action: "send", ...composeInput }),
    });
    assert.equal(rejectedSubmission.status, expectedHttp);
    assert.equal((await rejectedSubmission.json()).status, expectedStatus);
  }
  assert.equal(cleanedDraftCount, cleanedBeforeExplicitRejection + 4);
  assert.equal(queuedSubmissionCount, 3);
  submissionMode = "success";
  const draftWithSchedule = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "draft", ...composeInput, sendAtUtc: new Date(Date.now() + 3_600_000).toISOString() }),
  });
  assert.equal(draftWithSchedule.status, 400);
  assert.deepEqual(await draftWithSchedule.json(), { status: "invalid_request", field: "sendAtUtc" });
  const draftCountBeforeSchedule = createdDraftCount;
  const outOfRangeSchedule = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "send", ...composeInput, sendAtUtc: new Date(Date.now() + 8 * 86_400_000).toISOString() }),
  });
  assert.equal(outOfRangeSchedule.status, 400);
  assert.equal((await outOfRangeSchedule.json()).status, "invalid_request");
  assert.equal(createdDraftCount, draftCountBeforeSchedule, "out-of-range schedules must not create drafts");
  expectedScheduleAtUtc = new Date(Date.now() + 3_600_000).toISOString();
  const scheduledSend = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "send", ...composeInput, sendAtUtc: expectedScheduleAtUtc }),
  });
  assert.equal(scheduledSend.status, 200);
  assert.equal((await scheduledSend.json()).status, "submitted");
  assert.equal(createdDraftCount, draftCountBeforeSchedule + 1);
  assert.equal(queuedSubmissionCount, 4);
  const pendingPersonal = await fetch(`${origin}/api/mail/submissions`, { headers: { cookie } });
  assert.equal(pendingPersonal.status, 200);
  assert.deepEqual((await pendingPersonal.json()).items, [{ id: SUBMISSION, sendAt: expectedScheduleAtUtc,
    recipients: ["recipient@example.test"] }]);
  saturatedSubmissionList = true;
  const incompleteSubmissions = await fetch(`${origin}/api/mail/submissions`, { headers: { cookie } });
  saturatedSubmissionList = false;
  assert.equal(incompleteSubmissions.status, 502);
  assert.equal((await incompleteSubmissions.json()).status, "unavailable");
  const unauthenticatedSubmissions = await fetch(`${origin}/api/mail/submissions`);
  assert.equal(unauthenticatedSubmissions.status, 401);
  const invalidSubmissionId = await fetch(`${origin}/api/mail/submissions`, {
    method: "DELETE", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ submissionId: "invalid" }),
  });
  assert.equal(invalidSubmissionId.status, 400);
  const readOnlySubmissions = await fetch(`${origin}/api/mail/submissions?${new URLSearchParams({ accountId: READ_ONLY_SHARED_ACCOUNT })}`, { headers: { cookie } });
  assert.equal(readOnlySubmissions.status, 403);
  const crossOriginCancel = await fetch(`${origin}/api/mail/submissions`, {
    method: "DELETE", headers: { cookie, origin: "https://other.example.test", "content-type": "application/json" },
    body: JSON.stringify({ submissionId: SUBMISSION }),
  });
  assert.equal(crossOriginCancel.status, 403);
  const cancelPersonal = await fetch(`${origin}/api/mail/submissions`, {
    method: "DELETE", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ submissionId: SUBMISSION }),
  });
  assert.equal(cancelPersonal.status, 200);
  assert.equal((await cancelPersonal.json()).status, "canceled");
  const canceledPersonalList = await fetch(`${origin}/api/mail/submissions`, { headers: { cookie } });
  assert.deepEqual((await canceledPersonalList.json()).items, []);
  const repeatedCancel = await fetch(`${origin}/api/mail/submissions`, {
    method: "DELETE", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ submissionId: SUBMISSION }),
  });
  assert.equal(repeatedCancel.status, 409);
  assert.equal((await repeatedCancel.json()).status, "cannot_cancel");
  expectedScheduleAtUtc = null;
  for (const [contentType, expectedStatus, expectedCode] of [
    ["application/x-fixture-too-large", 413, "tooLarge"],
    ["application/x-fixture-over-quota", 507, "overQuota"],
    ["application/x-fixture-not-found", 502, "unavailable"],
    ["application/x-fixture-server-fail", 503, "retryable"],
  ]) {
    const rejectedUpload = await fetch(`${origin}/api/mail/upload?name=fixture.txt`, {
      method: "POST", headers: { cookie, origin, "content-type": contentType }, body: "synthetic-upload",
    });
    assert.equal(rejectedUpload.status, expectedStatus);
    assert.equal((await rejectedUpload.json()).status, expectedCode);
  }
  const sharedComposeOptions = await fetch(`${origin}/api/mail/compose?accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  assert.equal(sharedComposeOptions.status, 200);
  assert.deepEqual(await sharedComposeOptions.json(), {
    from: "team@example.test", signature: "", signatureHtml: "", signatureFormat: "text/plain",
    maxAttachmentBytes: 10_485_760, maxDelayedSend: 604_800, availableFrom: ["team@example.test"],
  });
  assert.equal((await fetch(`${origin}/api/mail/compose?accountId=${READ_ONLY_SHARED_ACCOUNT}`, { headers: { cookie } })).status, 403);
  assert.equal((await fetch(`${origin}/api/mail/compose?accountId=${ACCOUNT}`, { headers: { cookie } })).status, 403);
  assert.equal((await fetch(`${origin}/api/mail/compose?accountId=invalid`, { headers: { cookie } })).status, 400);
  const sharedInput = { ...composeInput, accountId: SHARED_ACCOUNT, fromAddress: "team@example.test" };
  const sharedDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ action: "draft", ...sharedInput }),
  });
  assert.equal(sharedDraft.status, 200);
  assert.deepEqual(await sharedDraft.json(), { status: "saved", draftId: SHARED_DRAFT, previousDraftCleanupConfirmed: true });
  const unrelatedSharedDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "draft", ...sharedInput, previousDraftId: DRAFT }),
  });
  assert.equal(unrelatedSharedDraft.status, 502);
  assert.equal(sharedDraftExists, true);
  sharedDraftCreateFails = true;
  const failedSharedResave = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "draft", ...sharedInput, subject: "Shared draft replacement", previousDraftId: SHARED_DRAFT }),
  });
  assert.equal(failedSharedResave.status, 409);
  assert.equal((await failedSharedResave.json()).status, "draft_uncertain");
  assert.equal(sharedDraftExists, true);
  assert.equal(sharedResavedExists, false);
  assert.equal(sharedDraftCleanupCount, 0);
  const resavedSharedDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "draft", ...sharedInput, subject: "Shared draft replacement", previousDraftId: SHARED_DRAFT }),
  });
  assert.equal(resavedSharedDraft.status, 200);
  assert.deepEqual(await resavedSharedDraft.json(), { status: "saved", draftId: SHARED_RESAVED_DRAFT, previousDraftCleanupConfirmed: true });
  assert.equal(sharedDraftCleanupCount, 1);
  assert.equal(sharedDraftExists, false);
  assert.equal(sharedResavedExists, true);
  assert.equal((await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "send", ...sharedInput }),
  })).status, 403);
  assert.equal((await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ action: "send", ...sharedInput, fromAddress: "fixture@example.test" }),
  })).status, 403);
  assert.equal((await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ action: "send", ...sharedInput, accountId: READ_ONLY_SHARED_ACCOUNT }),
  })).status, 403);
  const sharedUpload = await fetch(`${origin}/api/mail/upload?name=fixture.txt&accountId=${SHARED_ACCOUNT}`, {
    method: "POST", headers: { cookie, origin, "content-type": "text/plain" }, body: "synthetic-upload",
  });
  assert.equal(sharedUpload.status, 201);
  assert.equal((await sharedUpload.json()).blobId, `u:${UPLOAD}`);
  assert.equal((await fetch(`${origin}/api/mail/upload?name=fixture.txt&accountId=${READ_ONLY_SHARED_ACCOUNT}`, {
    method: "POST", headers: { cookie, origin, "content-type": "text/plain" }, body: "synthetic-upload",
  })).status, 403);
  const sharedSend = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ action: "send", ...sharedInput, previousDraftId: SHARED_RESAVED_DRAFT }),
  });
  assert.equal(sharedSend.status, 200);
  assert.deepEqual(await sharedSend.json(), { status: "submitted", previousDraftCleanupConfirmed: true });
  assert.equal(sharedSubmissionCount, 1);
  assert.equal(sharedResavedCleanupCount, 1);
  assert.equal(sharedResavedExists, false);
  const secondSharedDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "draft", ...sharedInput, subject: "Shared draft replacement" }),
  });
  assert.equal(secondSharedDraft.status, 200);
  assert.equal((await secondSharedDraft.json()).draftId, SHARED_RESAVED_DRAFT);
  assert.equal(sharedResavedExists, true);
  sharedSubmissionMode = "rejected";
  const rejectedSharedSend = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ action: "send", ...sharedInput, previousDraftId: SHARED_RESAVED_DRAFT }),
  });
  assert.equal(rejectedSharedSend.status, 403);
  assert.equal((await rejectedSharedSend.json()).status, "forbidden");
  assert.equal(sharedDraftCleanupCount, 2);
  assert.equal(sharedSubmissionCount, 1);
  assert.equal(sharedResavedExists, true);
  sharedSubmissionMode = "uncertain";
  const uncertainSharedSend = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ action: "send", ...sharedInput, previousDraftId: SHARED_RESAVED_DRAFT }),
  });
  assert.equal(uncertainSharedSend.status, 409);
  assert.equal((await uncertainSharedSend.json()).status, "submission_uncertain");
  assert.equal(sharedDraftCleanupCount, 2);
  assert.equal(sharedSubmissionCount, 1);
  assert.equal(sharedResavedExists, true);
  sharedSubmissionMode = "success";
  expectedSharedScheduleAtUtc = new Date(Date.now() + 7_200_000).toISOString();
  const scheduledSharedSend = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "send", ...sharedInput, sendAtUtc: expectedSharedScheduleAtUtc }),
  });
  assert.equal(scheduledSharedSend.status, 200);
  assert.equal((await scheduledSharedSend.json()).status, "submitted");
  assert.equal(sharedSubmissionCount, 2);
  const sharedSubmissionQuery = new URLSearchParams({ accountId: SHARED_ACCOUNT });
  const pendingShared = await fetch(`${origin}/api/mail/submissions?${sharedSubmissionQuery}`, { headers: { cookie } });
  assert.equal(pendingShared.status, 200);
  assert.deepEqual((await pendingShared.json()).items, [{ id: SUBMISSION, sendAt: expectedSharedScheduleAtUtc,
    recipients: ["recipient@example.test"] }]);
  const cancelShared = await fetch(`${origin}/api/mail/submissions`, {
    method: "DELETE", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ submissionId: SUBMISSION, accountId: SHARED_ACCOUNT }),
  });
  assert.equal(cancelShared.status, 200);
  assert.equal((await cancelShared.json()).status, "canceled");
  const canceledSharedList = await fetch(`${origin}/api/mail/submissions?${sharedSubmissionQuery}`, { headers: { cookie } });
  assert.deepEqual((await canceledSharedList.json()).items, []);
  expectedSharedScheduleAtUtc = null;
  const authenticatedLogin = await fetch(`${origin}/ko/login`, { headers: { cookie }, redirect: "manual" });
  assert.equal(authenticatedLogin.status, 307);
  assert.equal(authenticatedLogin.headers.get("location"), "/ko");
  const mailboxSummary = await fetch(`${origin}/api/mail/mailboxes`, { headers: { cookie } });
  assert.equal(mailboxSummary.status, 200);
  const mailboxSummaryData = await mailboxSummary.json();
  assert.equal(mailboxSummaryData.accountId, ACCOUNT);
  assert.equal(mailboxSummaryData.mailboxes.find((mailbox) => mailbox.role === "inbox")?.id, INBOX);
  assert.deepEqual(mailboxSummaryData.mailboxes.find((mailbox) => mailbox.id === CUSTOM), {
    id: CUSTOM, name: "Project", role: null, totalEmails: 1, unreadEmails: 0, usedBytes: null, quotaBytes: null,
  });

  const contacts = await fetch(`${origin}/api/mail/contacts`, { headers: { cookie } });
  assert.equal(contacts.status, 200);
  assert.equal((await contacts.json()).contacts[0].email, "contact@example.test");
  const contactHeaders = { cookie, origin, "content-type": "application/json" };
  const createContact = (email, displayName = "Synthetic Contact") => fetch(`${origin}/api/mail/contacts`, {
    method: "POST", headers: contactHeaders, body: JSON.stringify({ displayName, email }),
  });
  assert.equal((await createContact("contact@example.test")).status, 409);
  const createdContact = await createContact("new-contact@example.test");
  assert.equal(createdContact.status, 201);
  assert.deepEqual((await createdContact.json()).contact, fixtureContacts.find((contact) => contact.id === CREATED_CONTACT));
  const contactPath = `${origin}/api/mail/contacts/${CREATED_CONTACT}`;
  const updateContact = (email, displayName = "Updated Synthetic Contact") => fetch(contactPath, {
    method: "PATCH", headers: contactHeaders, body: JSON.stringify({ displayName, email }),
  });
  assert.equal((await updateContact("contact@example.test")).status, 409);
  const updatedContact = await updateContact("updated-contact@example.test");
  assert.equal(updatedContact.status, 200);
  assert.equal((await updatedContact.json()).contact.displayName, "Updated Synthetic Contact");
  const afterContactUpdate = await fetch(`${origin}/api/mail/contacts`, { headers: { cookie } });
  assert.equal(afterContactUpdate.status, 200);
  assert.equal((await afterContactUpdate.json()).contacts.find((contact) => contact.id === CREATED_CONTACT)?.email, "updated-contact@example.test");
  assert.equal((await fetch(contactPath, { method: "DELETE", headers: { cookie } })).status, 403);
  const deletedContact = await fetch(contactPath, { method: "DELETE", headers: { cookie, origin } });
  assert.equal(deletedContact.status, 204);
  const afterContactDelete = await fetch(`${origin}/api/mail/contacts`, { headers: { cookie } });
  assert.equal((afterContactDelete.status), 200);
  assert.equal((await afterContactDelete.json()).contacts.some((contact) => contact.id === CREATED_CONTACT), false);
  const missingContact = await fetch(contactPath, { method: "DELETE", headers: { cookie, origin } });
  assert.equal(missingContact.status, 404);
  assert.equal((await missingContact.json()).status, "not_found");
  const shared = await fetch(`${origin}/api/mail/shared-mailboxes`, { headers: { cookie } });
  assert.equal(shared.status, 200);
  const sharedItems = (await shared.json()).items;
  assert.equal(sharedItems[0].address, "team@example.test");
  assert.deepEqual(sharedItems[0].rights, { mayRead: true, mayWrite: true, maySend: true, mayManage: false });
  const approvals = await fetch(`${origin}/api/mail/approvals`, { headers: { cookie } });
  assert.equal(approvals.status, 200);
  const approvalItems = (await approvals.json()).items;
  assert.equal(approvalItems[0].title, "Fixture approval");
  assert.equal(approvalItems[0].isMyTurn, true);
  assert.equal(approvalItems[0].steps[0].state, "pending");
  const rules = await fetch(`${origin}/api/mail/rules`, { headers: { cookie } });
  assert.equal(rules.status, 200);
  const rulePage = await rules.json();
  assert.equal(rulePage.revision, 2);
  assert.equal(rulePage.rules[0].name, "Fixture rule");
  assert.equal(rulePage.source, "# Managed by TASTEMAIL Web Mail as 1 ordered rules.\n");
  const awaySource = makeAwaySource({ subject: "Out of office", message: "I am away.\nPlease try later.", enabled: true });
  const validation = await fetch(`${origin}/api/mail/rules/check`, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ intent: "validate", source: awaySource }),
  });
  assert.equal(validation.status, 200);
  assert.deepEqual(await validation.json(), { valid: true });
  const replacement = replaceManagedAwayRule(rulePage.rules, null, awaySource, true, "Out-of-office reply");
  const savedAway = await fetch(`${origin}/api/mail/rules`, {
    method: "PUT", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: rulePage.revision, rules: replacement }),
  });
  assert.equal(savedAway.status, 200);
  const savedRules = await savedAway.json();
  assert.equal(savedRules.revision, 3);
  assert.deepEqual(savedRules.rules[0], { ...rulePage.rules[0], updatedAt: "2026-09-29T00:00:00Z" });
  assert.equal(savedRules.rules[1].source, awaySource.replace(/\r\n?/gu, "\n"));
  assert.equal(savedRules.rules[1].enabled, true);
  const staleAway = await fetch(`${origin}/api/mail/rules`, {
    method: "PUT", headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: rulePage.revision, rules: replacement }),
  });
  assert.equal(staleAway.status, 409);
  assert.deepEqual(await staleAway.json(), { status: "conflict" });
  const unchangedRules = await fetch(`${origin}/api/mail/rules`, { headers: { cookie } });
  assert.equal((await unchangedRules.json()).revision, 3);
  const quarantine = await fetch(`${origin}/api/mail/quarantine`, { headers: { cookie } });
  assert.equal(quarantine.status, 200);
  const quarantinePage = await quarantine.json();
  assert.equal(quarantinePage.items[0].subject, "Fixture quarantine");
  assert.equal(quarantinePage.hasMore, true);
  const quarantineNext = await fetch(`${origin}/api/mail/quarantine?beforeCreatedAt=${encodeURIComponent(quarantinePage.nextBeforeCreatedAt)}&beforeId=${QUARANTINE}`, { headers: { cookie } });
  assert.equal(quarantineNext.status, 200);
  assert.equal((await quarantineNext.json()).items.length, 0);
  const invalidCursor = await fetch(`${origin}/api/mail/quarantine?beforeId=${QUARANTINE}`, { headers: { cookie } });
  assert.equal(invalidCursor.status, 400);
  const quarantineDetail = await fetch(`${origin}/api/mail/quarantine/${QUARANTINE}`, { headers: { cookie } });
  assert.equal(quarantineDetail.status, 200);
  const quarantineRecord = await quarantineDetail.json();
  assert.equal(quarantineRecord.textBody, "Safe plain text");
  assert.equal(JSON.stringify(quarantineRecord).includes("<script>"), false);
  const sharedMessages = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  assert.equal(sharedMessages.status, 200);
  assert.match(sharedMessages.headers.get("server-timing") ?? "", /^tastemail;dur=\d+\.\d$/u);
  const sharedPage = await sharedMessages.json();
  assert.equal(sharedPage.accountId, SHARED_ACCOUNT);
  assert.equal(sharedPage.mailboxId, SHARED_INBOX);
  assert.equal(sharedPage.messages[0].subject, "Fixture");
  assert.equal(sharedPage.messages[0].detailLoaded, true);
  selectiveSharedEmailGet = true;
  const sharedSummaryResponse = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  assert.equal(sharedSummaryResponse.status, 200);
  const sharedSummary = await sharedSummaryResponse.json();
  assert.equal(sharedSummary.messages[0].detailLoaded, false);
  assert.deepEqual(sharedSummary.messages[0].body, []);
  const sharedDetailResponse = await fetch(`${origin}/api/mail/shared-messages/${EMAIL}?accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  assert.equal(sharedDetailResponse.status, 200);
  assert.match(sharedDetailResponse.headers.get("server-timing") ?? "", /^tastemail;dur=\d+\.\d$/u);
  assert.equal((await sharedDetailResponse.json()).message.detailLoaded, true);
  assert.equal((await fetch(`${origin}/api/mail/shared-messages/${EMAIL}?accountId=${ACCOUNT}`, { headers: { cookie } })).status, 403);
  assert.equal((await fetch(`${origin}/api/mail/shared-messages/not-a-uuid?accountId=${SHARED_ACCOUNT}`, { headers: { cookie } })).status, 400);
  selectiveSharedEmailGet = false;
  const sharedFlagHeaders = { cookie, origin, "content-type": "application/json" };
  const sharedFlagBody = (accountId, value, flag = "seen") => JSON.stringify({ accountId, messageId: EMAIL, flag, value });
  const missingSharedOrigin = await fetch(`${origin}/api/mail/shared-messages`, { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: sharedFlagBody(SHARED_ACCOUNT, true) });
  assert.equal(missingSharedOrigin.status, 403);
  const unauthenticatedSharedFlag = await fetch(`${origin}/api/mail/shared-messages`, { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: sharedFlagBody(SHARED_ACCOUNT, true) });
  assert.equal(unauthenticatedSharedFlag.status, 401);
  const malformedSharedFlag = await fetch(`${origin}/api/mail/shared-messages`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedFlagBody("not-an-account-id", true) });
  assert.equal(malformedSharedFlag.status, 400);
  const personalSharedFlag = await fetch(`${origin}/api/mail/shared-messages`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedFlagBody(ACCOUNT, true) });
  assert.equal(personalSharedFlag.status, 403);
  const readOnlySharedFlag = await fetch(`${origin}/api/mail/shared-messages`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedFlagBody(READ_ONLY_SHARED_ACCOUNT, true) });
  assert.equal(readOnlySharedFlag.status, 403);
  const markSharedRead = await fetch(`${origin}/api/mail/shared-messages`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedFlagBody(SHARED_ACCOUNT, true) });
  assert.equal(markSharedRead.status, 200);
  assert.equal((await markSharedRead.json()).status, "updated");
  const sharedReadPage = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  assert.equal((await sharedReadPage.json()).messages[0].unread, false);
  const markSharedUnread = await fetch(`${origin}/api/mail/shared-messages`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedFlagBody(SHARED_ACCOUNT, false) });
  assert.equal(markSharedUnread.status, 200);
  const restoredSharedPage = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  assert.equal((await restoredSharedPage.json()).messages[0].unread, true);
  const markSharedStarred = await fetch(`${origin}/api/mail/shared-messages`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedFlagBody(SHARED_ACCOUNT, true, "starred") });
  assert.equal(markSharedStarred.status, 200);
  const starredSharedPage = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  const starredSharedMessage = (await starredSharedPage.json()).messages[0];
  assert.equal(starredSharedMessage.starred, true);
  assert.equal(starredSharedMessage.unread, true);
  const unstarShared = await fetch(`${origin}/api/mail/shared-messages`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedFlagBody(SHARED_ACCOUNT, false, "starred") });
  assert.equal(unstarShared.status, 200);
  const unstarredSharedPage = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  assert.equal((await unstarredSharedPage.json()).messages[0].starred, false);
  const sharedMoveBody = (accountId, target, sourceMailboxId = sharedFixtureMailbox, targetMailboxId) => JSON.stringify({ accountId, messageId: EMAIL, sourceMailboxId, target, targetMailboxId });
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: sharedMoveBody(SHARED_ACCOUNT, "trash") })).status, 403);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: sharedMoveBody(SHARED_ACCOUNT, "trash") })).status, 401);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody("bad-id", "trash") })).status, 400);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "archive") })).status, 400);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "trash", "bad-id") })).status, 400);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, undefined, SHARED_INBOX, "bad-id") })).status, 400);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "trash", SHARED_INBOX, SHARED_CUSTOM) })).status, 400);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, undefined, SHARED_INBOX, SHARED_INBOX) })).status, 400);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, undefined, SHARED_INBOX, SHARED_DRAFTS) })).status, 403);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, undefined, SHARED_INBOX, CUSTOM) })).status, 403);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "trash", SHARED_CUSTOM) })).status, 403);
  const personalSharedMove = await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(ACCOUNT, "trash") });
  assert.equal(personalSharedMove.status, 403, JSON.stringify(await personalSharedMove.json()));
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(READ_ONLY_SHARED_ACCOUNT, "trash") })).status, 403);
  sharedStaleMove = true;
  const conflictedSharedMove = await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "trash") });
  assert.equal(conflictedSharedMove.status, 409);
  assert.equal((await conflictedSharedMove.json()).status, "conflict");
  assert.equal(sharedFixtureMailbox, SHARED_INBOX);
  const moveSharedToTrash = await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "trash") });
  assert.equal(moveSharedToTrash.status, 200);
  assert.equal(sharedFixtureMailbox, SHARED_TRASH);
  const sharedTrashPage = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}&mailboxId=${SHARED_TRASH}`, { headers: { cookie } });
  assert.equal((await sharedTrashPage.json()).messages[0].id, EMAIL);
  const restoreShared = await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "inbox") });
  assert.equal(restoreShared.status, 200);
  assert.equal(sharedFixtureMailbox, SHARED_INBOX);
  const moveSharedToCustom = await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, undefined, SHARED_INBOX, SHARED_CUSTOM) });
  assert.equal(moveSharedToCustom.status, 200);
  assert.equal(sharedFixtureMailbox, SHARED_CUSTOM);
  const sharedCustomPage = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}&mailboxId=${SHARED_CUSTOM}`, { headers: { cookie } });
  assert.equal((await sharedCustomPage.json()).messages[0].id, EMAIL);
  const moveSharedCustomToTrash = await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "trash") });
  assert.equal(moveSharedCustomToTrash.status, 200);
  assert.equal(sharedFixtureMailbox, SHARED_TRASH);
  const emptiedSharedCustomPage = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}&mailboxId=${SHARED_CUSTOM}`, { headers: { cookie } });
  assert.equal((await emptiedSharedCustomPage.json()).messages.length, 0);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "inbox") })).status, 200);
  assert.equal(sharedFixtureMailbox, SHARED_INBOX);
  const malformedAccount = await fetch(`${origin}/api/mail/shared-messages?accountId=66666666--666-4666-8666-666666666666`, { headers: { cookie } });
  assert.equal(malformedAccount.status, 400);
  const malformedMailbox = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}&mailboxId=77777777--777-4777-8777-777777777777`, { headers: { cookie } });
  assert.equal(malformedMailbox.status, 400);
  const sharedDownload = await fetch(`${origin}/api/mail/attachments?blobId=${encodeURIComponent(ATTACHMENT)}&accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  assert.equal(sharedDownload.status, 200);
  assert.equal(await sharedDownload.text(), "synthetic-attachment");
  const foreignDownload = await fetch(`${origin}/api/mail/attachments?blobId=${encodeURIComponent(ATTACHMENT)}&accountId=44444444-4444-4444-8444-444444444444`, { headers: { cookie } });
  assert.equal(foreignDownload.status, 403);
  const foreignAccount = await fetch(`${origin}/api/mail/shared-messages?accountId=${ACCOUNT}`, { headers: { cookie } });
  assert.equal(foreignAccount.status, 403);
  const foreignMailbox = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}&mailboxId=${INBOX}`, { headers: { cookie } });
  assert.equal(foreignMailbox.status, 403);
  const sharedDestroyBody = (accountId, messageId = EMAIL) => JSON.stringify({ accountId, messageId });
  const sharedDestroy = (accountId, messageId = EMAIL, headers = sharedFlagHeaders) => fetch(`${origin}/api/mail/shared-destroy`, {
    method: "POST", headers, body: sharedDestroyBody(accountId, messageId),
  });
  assert.equal((await sharedDestroy(SHARED_ACCOUNT, EMAIL, { cookie, "content-type": "application/json" })).status, 403);
  assert.equal((await sharedDestroy(SHARED_ACCOUNT, EMAIL, { origin, "content-type": "application/json" })).status, 401);
  assert.equal((await sharedDestroy("bad-id")).status, 400);
  assert.equal((await sharedDestroy(ACCOUNT)).status, 403);
  assert.equal((await sharedDestroy(READ_ONLY_SHARED_ACCOUNT)).status, 403);
  assert.equal((await sharedDestroy(SHARED_ACCOUNT)).status, 403, "shared email outside trash must not be destroyed");
  assert.equal(sharedFixtureDestroyed, false);
  assert.equal((await fetch(`${origin}/api/mail/shared-move`, { method: "PATCH", headers: sharedFlagHeaders, body: sharedMoveBody(SHARED_ACCOUNT, "trash") })).status, 200);
  sharedStaleDestroy = true;
  const conflictedSharedDestroy = await sharedDestroy(SHARED_ACCOUNT);
  assert.equal(conflictedSharedDestroy.status, 409);
  assert.equal((await conflictedSharedDestroy.json()).status, "conflict");
  assert.equal(sharedFixtureDestroyed, false);
  const sharedDeleted = await sharedDestroy(SHARED_ACCOUNT);
  assert.equal(sharedDeleted.status, 200);
  assert.deepEqual(await sharedDeleted.json(), { status: "destroyed" });
  assert.equal(sharedFixtureDestroyed, true);
  const afterSharedDestroy = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}&mailboxId=${SHARED_TRASH}`, { headers: { cookie } });
  assert.equal((await afterSharedDestroy.json()).messages.length, 0);
  const events = await fetch(`${origin}/api/mail/events?${eventQuery}`, { headers: { cookie } });
  assert.equal(events.status, 200);
  assert.equal((await events.json()).events[0].title, "Fixture event");
  const invalidEvents = await fetch(`${origin}/api/mail/events?from=2026-09-01T00%3A00%3A00Z&to=2028-09-01T00%3A00%3A00Z`, { headers: { cookie } });
  assert.equal(invalidEvents.status, 400);
  const createEvent = (attendeeUsernames) => fetch(`${origin}/api/mail/events`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ title: "Fixture invitation", startsAt: "2026-09-28T10:00:00Z", endsAt: "2026-09-28T11:00:00Z",
      timezone: "Asia/Seoul", attendeeUsernames }),
  });
  assert.equal((await createEvent(["guest@example.test", "guest@example.test"])).status, 400);
  assert.equal(eventCreateCalls, 0);
  const created = await createEvent(["guest@example.test"]);
  assert.equal(created.status, 201);
  assert.deepEqual((await created.json()).event.attendeeAddresses, ["guest@example.test"]);
  assert.equal(eventCreateCalls, 1);
  const invalidAllDay = await fetch(`${origin}/api/mail/events`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ title: "Fixture all-day event", startsAt: "2026-09-09T15:00:00.000Z",
      endsAt: "2026-09-10T15:00:00.000Z", timezone: "Asia/Seoul", allDay: "true", attendeeUsernames: [] }),
  });
  assert.equal(invalidAllDay.status, 400);
  assert.equal(eventCreateCalls, 1);
  const allDayCreated = await fetch(`${origin}/api/mail/events`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ title: "Fixture all-day event", startsAt: "2026-09-09T15:00:00.000Z",
      endsAt: "2026-09-10T15:00:00.000Z", timezone: "Asia/Seoul", allDay: true, attendeeUsernames: [] }),
  });
  assert.equal(allDayCreated.status, 201);
  assert.equal((await allDayCreated.json()).event.allDay, true);
  assert.equal(eventCreateCalls, 2);
  const eventUpdate = {
    expectedRevision: 1, currentStartsAt: "2026-09-28T10:00:00Z",
    title: "Fixture event", description: "Synthetic event", location: "Test room",
    startsAt: "2026-09-28T10:00:00Z", endsAt: "2026-09-28T11:00:00Z",
    allDay: false, timezone: "Asia/Seoul",
  };
  const updateEvent = (input) => fetch(`${origin}/api/mail/events/${EVENT}`, {
    method: "PUT", headers: { cookie, "content-type": "application/json", origin }, body: JSON.stringify(input),
  });
  const cancelEvent = (input) => fetch(`${origin}/api/mail/events/${EVENT}`, {
    method: "DELETE", headers: { cookie, "content-type": "application/json", origin }, body: JSON.stringify(input),
  });
  assert.equal((await updateEvent(eventUpdate)).status, 200);
  assert.equal(eventMutationCalls, 1);
  assert.equal((await updateEvent(eventUpdate)).status, 409);
  assert.equal(eventMutationCalls, 1);
  eventAttendees = ["guest@example.test"];
  assert.equal((await updateEvent({ ...eventUpdate, expectedRevision: 2 })).status, 200);
  assert.equal(eventMutationCalls, 2);
  assert.equal((await cancelEvent({ expectedRevision: 3, currentStartsAt: eventUpdate.currentStartsAt })).status, 200);
  assert.equal(eventMutationCalls, 3);

  const first = await fetch(`${origin}/api/mail/messages?folder=inbox&position=0`, { headers: { cookie } });
  assert.equal(first.status, 200);
  assert.match(first.headers.get("server-timing") ?? "", /^tastemail;dur=\d+\.\d, mailbox;dur=\d+\.\d, query;dur=\d+\.\d, emailget;dur=\d+\.\d$/u);
  const page = await first.json();
  assert.equal(page.mailboxId, INBOX);
  assert.equal(page.mailboxes[0].usedBytes, 2097152);
  assert.equal(page.mailboxes[0].quotaBytes, 10737418240);
  assert.equal(page.total, 1);
  assert.equal(page.messages[0].from.name, "Alice");
  assert.equal(page.messages[0].replyTo, "reply@example.test");
  assert.deepEqual(page.messages[0].messageId, ["original@example.test"]);
  assert.deepEqual(page.messages[0].inReplyTo, ["earlier@example.test"]);
  assert.deepEqual(page.messages[0].references, ["root@example.test", "earlier@example.test"]);
  assert.deepEqual(page.messages[0].body, ["Synthetic text only"]);
  assert.equal(page.messages[0].detailLoaded, true);
  selectiveEmailGet = true;
  const summaryResponse = await fetch(`${origin}/api/mail/messages?folder=inbox`, { headers: { cookie } });
  assert.equal(summaryResponse.status, 200);
  const summaryPage = await summaryResponse.json();
  assert.equal(summaryPage.messages[0].detailLoaded, false);
  assert.deepEqual(summaryPage.messages[0].body, []);
  const detailResponse = await fetch(`${origin}/api/mail/messages/${EMAIL}`, { headers: { cookie } });
  assert.equal(detailResponse.status, 200);
  assert.match(detailResponse.headers.get("server-timing") ?? "", /^tastemail;dur=\d+\.\d$/u);
  const detail = (await detailResponse.json()).message;
  assert.equal(detail.id, EMAIL);
  assert.equal(detail.detailLoaded, true);
  assert.deepEqual(detail.body, ["Synthetic text only"]);
  const invalidDetail = await fetch(`${origin}/api/mail/messages/not-a-uuid`, { headers: { cookie } });
  assert.equal(invalidDetail.status, 400);
  selectiveEmailGet = false;
  assert.equal(page.messages[0].attachments[0].name, "fixture.txt");
  assert.equal(JSON.stringify(page).includes(TOKEN), false);
  const customPageResponse = await fetch(`${origin}/api/mail/messages?folder=custom&mailboxId=${CUSTOM}`, { headers: { cookie } });
  assert.equal(customPageResponse.status, 200);
  const customPage = await customPageResponse.json();
  assert.equal(customPage.mailboxId, CUSTOM);
  assert.equal(customPage.messages[0].id, EMAIL);
  assert.equal(customPage.messages[0].folder, "custom");
  for (const query of [
    "folder=custom", `folder=custom&mailboxId=${INBOX}`,
    "folder=custom&mailboxId=not-a-uuid", `folder=inbox&mailboxId=${CUSTOM}`,
  ]) {
    const response = await fetch(`${origin}/api/mail/messages?${query}`, { headers: { cookie } });
    assert.equal(response.status, query === `folder=custom&mailboxId=${INBOX}` ? 403 : 400);
  }
  const download = await fetch(`${origin}/api/mail/attachments?blobId=${encodeURIComponent(ATTACHMENT)}`, { headers: { cookie } });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/octet-stream");
  assert.equal(download.headers.get("content-disposition"), "attachment; filename=\"fixture.txt\"");
  assert.equal(download.headers.get("cache-control"), "no-store");
  assert.equal(await download.text(), "synthetic-attachment");

  const forbiddenOrigin = await fetch(`${origin}/api/mail/flags`, { method: "PATCH", headers: { cookie, "content-type": "application/json", origin: "https://unrelated.example.test" }, body: JSON.stringify({ messageId: EMAIL, flag: "seen", value: true }) });
  assert.equal(forbiddenOrigin.status, 403);
  for (const [path, method] of [["flags", "PATCH"], ["move", "PATCH"], ["destroy", "POST"], ["contacts", "POST"]]) {
    const missingOrigin = await fetch(`${origin}/api/mail/${path}`, { method, headers: { cookie, "content-type": "application/json" }, body: "{}" });
    assert.equal(missingOrigin.status, 403, `${path} must reject a mutation without Origin`);
  }
  const invalidFlag = await fetch(`${origin}/api/mail/flags`, { method: "PATCH", headers: { cookie, "content-type": "application/json", origin }, body: JSON.stringify({ messageId: EMAIL, flag: "destroy", value: true }) });
  assert.equal(invalidFlag.status, 400);
  async function setFlag(messageId, flag, value) {
    return fetch(`${origin}/api/mail/flags`, { method: "PATCH", headers: { cookie, "content-type": "application/json", origin }, body: JSON.stringify({ messageId, flag, value }) });
  }
  const seen = await setFlag(EMAIL, "seen", true);
  assert.equal(seen.status, 200);
  assert.deepEqual(await seen.json(), { status: "updated" });
  const failedFlag = await setFlag(SERVER_FAIL_EMAIL, "seen", true);
  assert.equal(failedFlag.status, 503);
  assert.equal((await failedFlag.json()).status, "retryable");
  assert.equal(fixtureSeen, true);
  const starred = await setFlag(EMAIL, "starred", true);
  assert.equal(starred.status, 200);
  assert.equal(fixtureStarred, true);
  const rejected = await setFlag("44444444-4444-4444-8444-444444444444", "starred", true);
  assert.equal(rejected.status, 502);
  assert.equal((await rejected.json()).status, "unavailable");
  const afterFlags = await fetch(`${origin}/api/mail/messages?folder=inbox`, { headers: { cookie } });
  assert.equal(afterFlags.status, 200);
  assert.equal((await afterFlags.json()).messages[0].unread, false);

  const second = await fetch(`${origin}/api/mail/messages?folder=inbox&position=50`, { headers: { cookie } });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).messages.length, 0);
  fixturePagination = true;
  const firstFullPage = await fetch(`${origin}/api/mail/messages?folder=inbox&position=0`, { headers: { cookie } });
  assert.equal(firstFullPage.status, 200);
  const fullPage = await firstFullPage.json();
  assert.equal(fullPage.total, 51);
  assert.equal(fullPage.limit, 50);
  assert.equal(fullPage.messages.length, 50);
  assert.equal(fullPage.messages[0].id, PAGED_IDS[0]);
  assert.equal(fullPage.messages[49].id, PAGED_IDS[49]);
  const lastPageResponse = await fetch(`${origin}/api/mail/messages?folder=inbox&position=50`, { headers: { cookie } });
  assert.equal(lastPageResponse.status, 200);
  const lastPage = await lastPageResponse.json();
  assert.equal(lastPage.position, 50);
  assert.equal(lastPage.total, 51);
  assert.deepEqual(lastPage.messages.map((message) => message.id), [PAGED_IDS[50]]);
  fixturePagination = false;

  const search = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("  한글 special & search  ")}`, { headers: { cookie } });
  assert.equal(search.status, 200);
  assert.match(search.headers.get("server-timing") ?? "", /^tastemail;dur=\d+\.\d$/u);
  const searchPage = await search.json();
  assert.equal(searchPage.total, 1);
  assert.equal(searchPage.messages[0].mailboxName, "Inbox");
  assert.equal(searchPage.messages[0].mailboxRole, "inbox");
  assert.equal(searchPage.messages[0].subject, "Fixture");
  assert.equal(searchPage.messages[0].detailLoaded, true);
  selectiveEmailGet = true;
  const searchSummaryResponse = await fetch(`${origin}/api/mail/search?q=fixture`, { headers: { cookie } });
  assert.equal(searchSummaryResponse.status, 200);
  const searchSummary = await searchSummaryResponse.json();
  assert.equal(searchSummary.messages[0].mailboxName, "Inbox");
   assert.equal(searchSummary.messages[0].detailLoaded, false);
   assert.deepEqual(searchSummary.messages[0].body, []);
   assert.equal(searchSummary.messages[0].attachments, undefined);
   const fileSummaryResponse = await fetch(`${origin}/api/mail/search?q=&hasAttachment=1&includeAttachments=1`, { headers: { cookie } });
   assert.equal(fileSummaryResponse.status, 200);
   const fileSummary = await fileSummaryResponse.json();
   assert.equal(fileSummary.messages[0].detailLoaded, false);
   assert.deepEqual(fileSummary.messages[0].body, []);
   assert.equal(fileSummary.messages[0].attachments[0].name, "fixture.txt");
   assert.equal((await fetch(`${origin}/api/mail/search?includeAttachments=1`, { headers: { cookie } })).status, 400);
   selectiveEmailGet = false;
  const phraseSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent('"인프라 예산"')}`, { headers: { cookie } });
  assert.equal(phraseSearch.status, 200);
  assert.equal((await phraseSearch.json()).total, 1);
  const operatorSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("from:alice@example.test has:attachment")}`, { headers: { cookie } });
  assert.equal(operatorSearch.status, 200);
  assert.equal((await operatorSearch.json()).total, 1);
  const unreadRecipientSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("to:fixture@example.test is:unread")}`, { headers: { cookie } });
  assert.equal(unreadRecipientSearch.status, 200);
  assert.equal((await unreadRecipientSearch.json()).total, 1);
  const starredBodySearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("body:Synthetic is:starred")}`, { headers: { cookie } });
  assert.equal(starredBodySearch.status, 200);
  assert.equal((await starredBodySearch.json()).total, 1);
  const dateSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("after:2026-09-01 before:2026-10-01")}`, { headers: { cookie } });
  assert.equal(dateSearch.status, 200);
  assert.equal((await dateSearch.json()).total, 1);
  const sizeSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("larger:10mb smaller:1gb")}`, { headers: { cookie } });
  assert.equal(sizeSearch.status, 200);
  assert.equal((await sizeSearch.json()).total, 1);
  const invalidStateSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("is:unknown")}`, { headers: { cookie } });
  assert.equal(invalidStateSearch.status, 400);
  const folderSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("in:inbox fixture")}`, { headers: { cookie } });
  assert.equal(folderSearch.status, 200);
  assert.equal((await folderSearch.json()).total, 1);
  const localizedFolderSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("in:받은편지함 fixture")}`, { headers: { cookie } });
  assert.equal(localizedFolderSearch.status, 200);
  assert.equal((await localizedFolderSearch.json()).total, 1);
  const namedFolderSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("in:Project fixture")}`, { headers: { cookie } });
  assert.equal(namedFolderSearch.status, 200);
  assert.equal((await namedFolderSearch.json()).messages[0].mailboxName, "Project");
  for (const malformedQuery of ["from:", "has:unknown", "before:2026-02-30", "larger:ten", "smaller:0"]) {
    const response = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent(malformedQuery)}`, { headers: { cookie } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).status, "invalid_request");
  }
  const missingFolderSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("in:unknown fixture")}`, { headers: { cookie } });
  assert.equal(missingFolderSearch.status, 200);
  assert.equal((await missingFolderSearch.json()).total, 0);
  const filteredSearchParams = new URLSearchParams({ q: "fixture", folder: "inbox", after: "2026-09-01T00:00:00.000Z", hasAttachment: "1" });
  const filteredSearch = await fetch(`${origin}/api/mail/search?${filteredSearchParams}`, { headers: { cookie } });
  assert.equal(filteredSearch.status, 200);
  assert.equal((await filteredSearch.json()).total, 1);
  for (const folder of ["drafts", "spam", "trash"]) {
    const response = await fetch(`${origin}/api/mail/search?q=fixture&folder=${folder}`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.total, 1);
    assert.equal(result.messages[0].mailboxName, { drafts: "Drafts", spam: "Spam", trash: "Trash" }[folder]);
    assert.equal(result.messages[0].mailboxRole, { drafts: "drafts", spam: "junk", trash: "trash" }[folder]);
  }
  const oldestBefore = ascendingSearchCount;
  const oldestSearch = await fetch(`${origin}/api/mail/search?q=fixture&sort=oldest`, { headers: { cookie } });
  assert.equal(oldestSearch.status, 200);
  assert.equal((await oldestSearch.json()).total, 1);
  assert.equal(ascendingSearchCount, oldestBefore + 1);
  assert.equal((await fetch(`${origin}/api/mail/search?q=fixture&sort=sender`, { headers: { cookie } })).status, 400);
  const customFolderSearch = await fetch(`${origin}/api/mail/search?q=fixture&mailboxId=${CUSTOM}`, { headers: { cookie } });
  assert.equal(customFolderSearch.status, 200);
  assert.equal((await customFolderSearch.json()).messages[0].id, EMAIL);
  const foreignCustomFolderSearch = await fetch(`${origin}/api/mail/search?q=fixture&mailboxId=${SHARED_INBOX}`, { headers: { cookie } });
  assert.equal(foreignCustomFolderSearch.status, 403);
  for (const queryString of [`q=fixture&mailboxId=${INBOX}`, "q=fixture&mailboxId=invalid", `q=fixture&folder=inbox&mailboxId=${CUSTOM}`]) {
    const response = await fetch(`${origin}/api/mail/search?${queryString}`, { headers: { cookie } });
    assert.equal(response.status, queryString === `q=fixture&mailboxId=${INBOX}` ? 403 : 400);
  }
  const allSearch = await fetch(`${origin}/api/mail/search?q=%20`, { headers: { cookie } });
  assert.equal(allSearch.status, 200);
  assert.equal((await allSearch.json()).total, 1);
  const invalidFilter = await fetch(`${origin}/api/mail/search?q=fixture&folder=unknown`, { headers: { cookie } });
  assert.equal(invalidFilter.status, 400);
  for (const [query, httpStatus, status] of [
    ["jmap-forbidden", 403, "forbidden"],
    ["jmap-account-inaccessible", 403, "forbidden"],
    ["jmap-rate-limit", 429, "rateLimited"],
    ["jmap-server-fail", 503, "retryable"],
  ]) {
    const response = await fetch(`${origin}/api/mail/search?q=${query}`, { headers: { cookie } });
    assert.equal(response.status, httpStatus);
    assert.equal((await response.json()).status, status);
  }

  async function move(messageId, target, overrideOrigin = origin, mailboxId, sourceMailboxId) {
    return fetch(`${origin}/api/mail/move`, { method: "PATCH", headers: { cookie, "content-type": "application/json", origin: overrideOrigin }, body: JSON.stringify({ messageId, target, mailboxId, sourceMailboxId }) });
  }
  assert.equal((await move(EMAIL, "archive", "https://unrelated.example.test")).status, 403);
  assert.equal((await move(EMAIL, "starred")).status, 400);
  assert.equal((await move(EMAIL, "custom", origin, "not-a-mailbox-id")).status, 400);
  assert.equal((await move(EMAIL, "custom", origin, "44444444-4444-4444-8444-444444444444")).status, 403);
  assert.equal((await move("44444444-4444-4444-8444-444444444444", "archive")).status, 502);
  assert.equal(fixtureMailbox, INBOX);
  staleMove = 1;
  const conflictedMoveBefore = fixturePersonalMailboxIds();
  const conflictedMove = await move(EMAIL, "archive");
  assert.equal(conflictedMove.status, 200);
  assert.deepEqual(await conflictedMove.json(), { status: "updated", snapshot: { sizeBytes: EMAIL_SIZE, mailboxIds: conflictedMoveBefore } });
  assert.equal(fixtureMailbox, ARCHIVE);
  assert.equal((await move(EMAIL, "inbox")).status, 200);
  assert.equal(fixtureMailbox, INBOX);
  staleMove = 2;
  const repeatedlyConflictedMove = await move(EMAIL, "archive");
  assert.equal(repeatedlyConflictedMove.status, 409);
  assert.equal((await repeatedlyConflictedMove.json()).status, "conflict");
  assert.equal(fixtureMailbox, INBOX);
  for (const [target, expectedMailbox] of [["archive", ARCHIVE], ["spam", SPAM], ["trash", TRASH], ["inbox", INBOX]]) {
    const previousMailboxes = fixturePersonalMailboxIds();
    const response = await move(EMAIL, target);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "updated", snapshot: { sizeBytes: EMAIL_SIZE, mailboxIds: previousMailboxes } });
    assert.equal(fixtureMailbox, expectedMailbox);
    const movedPage = await fetch(`${origin}/api/mail/messages?folder=${target}`, { headers: { cookie } });
    assert.equal(movedPage.status, 200);
    assert.equal((await movedPage.json()).messages[0].id, EMAIL);
  }
  const customMove = await move(EMAIL, "custom", origin, CUSTOM);
  assert.equal(customMove.status, 200);
  assert.equal(fixtureMailbox, CUSTOM);
  assert.equal((await move(EMAIL, "custom", origin, CUSTOM_OTHER, "invalid")).status, 400);
  assert.equal((await move(EMAIL, "custom", origin, CUSTOM, CUSTOM)).status, 400);
  assert.equal((await move(EMAIL, "archive", origin, undefined, CUSTOM_OTHER)).status, 403);
  assert.equal(fixtureMailbox, CUSTOM);
  const betweenCustom = await move(EMAIL, "custom", origin, CUSTOM_OTHER, CUSTOM);
  assert.equal(betweenCustom.status, 200);
  assert.equal(fixtureMailbox, CUSTOM_OTHER);
  assert.equal(fixtureCustomMembership, false);
  assert.equal(fixtureOtherCustomMembership, true);
  const fromOtherToArchive = await move(EMAIL, "archive", origin, undefined, CUSTOM_OTHER);
  assert.equal(fromOtherToArchive.status, 200);
  assert.equal(fixtureMailbox, ARCHIVE);
  assert.equal(fixtureOtherCustomMembership, false);

  const destroy = (messageId, overrideOrigin = origin) => fetch(`${origin}/api/mail/destroy`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin: overrideOrigin },
    body: JSON.stringify({ messageId }),
  });
  assert.equal((await destroy(EMAIL, "https://unrelated.example.test")).status, 403);
  assert.equal((await destroy("invalid")).status, 400);
  assert.equal((await destroy(EMAIL)).status, 403, "mail outside trash must not be destroyed");
  assert.equal(fixtureDestroyed, false);
  assert.equal((await move(EMAIL, "trash")).status, 200);
  const deleted = await destroy(EMAIL);
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { status: "destroyed", snapshot: { sizeBytes: EMAIL_SIZE, mailboxIds: [TRASH] } });
  assert.equal(fixtureDestroyed, true);
  const afterDestroy = await fetch(`${origin}/api/mail/messages?folder=trash`, { headers: { cookie } });
  assert.equal(afterDestroy.status, 200);
  assert.equal((await afterDestroy.json()).messages.length, 0);

  const invalidHtmlDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "draft", ...composeInput, htmlBody: 42 }),
  });
  assert.equal(invalidHtmlDraft.status, 400);
  assert.deepEqual(await invalidHtmlDraft.json(), { status: "invalid_request", field: "htmlBody" });
  const htmlDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "draft", ...composeInput, to: [], subject: "Synthetic HTML draft",
      body: "Synthetic formatted text", htmlBody: "<p>Synthetic <strong>formatted</strong> text</p>" }),
  });
  assert.equal(htmlDraft.status, 200);
  assert.equal((await htmlDraft.json()).status, "saved");
  const invalidInlineDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "draft", ...composeInput, htmlBody: "<p>Inline</p>",
      attachments: [{ blobId: ATTACHMENT, name: "inline.png", type: "image/png", size: 2048,
        disposition: "inline", cid: "bad<cid" }] }),
  });
  assert.equal(invalidInlineDraft.status, 400);
  assert.deepEqual(await invalidInlineDraft.json(), { status: "invalid_request", field: "attachments" });
  const orphanInlineDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "draft", ...composeInput, htmlBody: "<p>No inline image</p>",
      attachments: [{ blobId: ATTACHMENT, name: "inline.png", type: "image/png", size: 2048,
        disposition: "inline", cid: "inline@example.test" }] }),
  });
  assert.equal(orphanInlineDraft.status, 400);
  assert.deepEqual(await orphanInlineDraft.json(), { status: "invalid_request", field: "attachments" });
  const svgInlineDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "draft", ...composeInput, htmlBody: '<img src="cid:inline@example.test">',
      attachments: [{ blobId: ATTACHMENT, name: "inline.svg", type: "image/svg+xml", size: 2048,
        disposition: "inline", cid: "inline@example.test" }] }),
  });
  assert.equal(svgInlineDraft.status, 400);
  assert.deepEqual(await svgInlineDraft.json(), { status: "invalid_request", field: "attachments" });
  const inlineDraft = await fetch(`${origin}/api/mail/compose`, {
    method: "POST", headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify({ action: "draft", ...composeInput, to: [], subject: "Synthetic inline metadata draft",
      htmlBody: '<p><img src="cid:inline@example.test" alt="inline"></p>',
      attachments: [{ blobId: ATTACHMENT, name: "inline.png", type: "image/png", size: 2048,
        disposition: "inline", cid: "inline@example.test" }] }),
  });
  assert.equal(inlineDraft.status, 200);
  assert.equal((await inlineDraft.json()).status, "saved");

  const logout = await fetch(`${origin}/api/mail/session`, { method: "DELETE", headers: { cookie, origin } });
  assert.equal(logout.status, 200);
  assert.equal((await logout.json()).status, "signed_out");
  const uncertainLogout = await fetch(`${origin}/api/mail/session`, {
    method: "DELETE", headers: { cookie: "gxwebmail_tastemail_session=unavailable-token", origin },
  });
  assert.equal(uncertainLogout.status, 503);
  assert.equal((await uncertainLogout.json()).status, "signout_unconfirmed");
  assert.match(uncertainLogout.headers.get("set-cookie") ?? "", /^gxwebmail_tastemail_session=;/u);
  const alreadySignedOut = await fetch(`${origin}/api/mail/session`, { method: "DELETE", headers: { origin } });
  assert.equal(alreadySignedOut.status, 200);
  assert.equal((await alreadySignedOut.json()).status, "signed_out");

  console.log("Synthetic TASTEMAIL session and JMAP read/write contract: passed");
} finally {
  if (app && app.exitCode === null) {
    app.kill();
    await Promise.race([new Promise((resolveExit) => app.once("exit", resolveExit)), delay(2_000)]);
  }
  api.closeAllConnections();
  await new Promise((resolveClose) => api.close(resolveClose));
}
