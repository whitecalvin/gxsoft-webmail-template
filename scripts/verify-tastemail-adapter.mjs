#!/usr/bin/env node
// Contract smoke test against a synthetic loopback API; no real account or mail is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAIL = "urn:ietf:params:jmap:mail";
const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const SHARED_ACCOUNT = "66666666-6666-4666-8666-666666666666";
const INBOX = "22222222-2222-4222-8222-222222222222";
const ARCHIVE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPAM = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TRASH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CUSTOM = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SHARED_INBOX = "77777777-7777-4777-8777-777777777777";
const EMAIL = "33333333-3333-4333-8333-333333333333";
const SERVER_FAIL_EMAIL = "88888888-8888-4888-8888-888888888888";
const EVENT = "55555555-5555-4555-8555-555555555555";
const CREATED_EVENT = "99999999-9999-4999-8999-999999999999";
const QUARANTINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ATTACHMENT = `m:${EMAIL}:0`;
const TOKEN = "synthetic-loopback-token";
let fixtureSeen = false;
let fixtureStarred = false;
let fixtureMailbox = INBOX;
let staleMove = false;
let healthAvailable = true;
let eventRevision = 1;
let eventStatus = "confirmed";
let eventAttendees = [];
let eventMutationCalls = 0;
let eventCreateCalls = 0;

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
    return healthAvailable
      ? reply(response, 200, { status: "ok", service: "tastedev-mail" })
      : reply(response, 503, { status: "unavailable" });
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
    return credentials.username === "fixture@example.test" && credentials.password === "fixture-only"
      || credentials.username === "mfa@example.test" && credentials.password === "fixture-only" && credentials.mfaCode === "123456"
      ? reply(response, 200, { accessToken: TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() })
      : reply(response, 401, { type: "unauthorized" });
  }
  if (request.headers.authorization === "Bearer expired-token") return reply(response, 401, { type: "unauthorized" });
  if (request.headers.authorization === "Bearer forbidden-token") return reply(response, 403, { type: "forbidden" });
  if (request.headers.authorization === "Bearer limited-token") return reply(response, 429, { type: "rateLimit" });
  if (request.headers.authorization === "Bearer unavailable-token") return reply(response, 503, { type: "serverFail" });
  if (request.headers.authorization !== `Bearer ${TOKEN}`) return reply(response, 401, { type: "unauthorized" });
  if (request.url === "/api/auth/session" && request.method === "DELETE") return reply(response, 204, {});
  if (request.url === "/.well-known/jmap") {
    return reply(response, 200, { apiUrl: "/jmap/api", username: "fixture@example.test", primaryAccounts: { [MAIL]: ACCOUNT }, accounts: {
      [ACCOUNT]: { name: "fixture@example.test", isPersonal: true },
      [SHARED_ACCOUNT]: { name: "team@example.test", isPersonal: false, "x-tastemail-rights": { mayRead: true, mayWrite: false } },
    } });
  }
  if (request.url?.startsWith("/jmap/download/") && request.method === "GET") {
    const segments = new URL(request.url, "http://127.0.0.1").pathname.split("/").map(decodeURIComponent);
    assert.ok([ACCOUNT, SHARED_ACCOUNT].includes(segments[3]));
    assert.deepEqual(segments.slice(4), [ATTACHMENT, "attachment"]);
    response.writeHead(200, { "content-type": "text/plain", "content-disposition": "attachment; filename=\"fixture.txt\"" });
    response.end("synthetic-attachment");
    return;
  }
  if (request.url === "/api/contacts" && request.method === "GET") {
    return reply(response, 200, { contacts: [{ id: "44444444-4444-4444-8444-444444444444", displayName: "Fixture Contact", email: "contact@example.test", createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" }] });
  }
  if (request.url === "/api/shared-mailboxes" && request.method === "GET") {
    return reply(response, 200, { items: [{
      id: "66666666-6666-4666-8666-666666666666", address: "team@example.test", displayName: "Fixture Team",
      quotaBytes: 10737418240, usedBytes: 1048576, revision: 1,
      rights: { mayRead: true, mayWrite: false, maySend: true, mayManage: false },
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
    return reply(response, 200, { revision: 2, mode: "rules", source: "keep;", enabled: true, rules: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Fixture rule", kind: "filter",
      source: "keep;", enabled: true, position: 0, updatedAt: "2026-09-28T00:00:00Z",
    }] });
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
    assert.deepEqual(input.attendeeUsernames, ["guest@example.test"]);
    eventCreateCalls += 1;
    return reply(response, 200, { ...fixtureEvent(), id: CREATED_EVENT, attendeeAddresses: input.attendeeUsernames });
  }
  if (request.url === `/api/events/${EVENT}` && (request.method === "PUT" || request.method === "DELETE")) {
    const input = await body(request);
    assert.equal(input.expectedRevision, eventRevision);
    if (request.method === "PUT") assert.deepEqual(input.attendeeUsernames, []);
    eventMutationCalls += 1;
    eventRevision += 1;
    if (request.method === "DELETE") eventStatus = "cancelled";
    return reply(response, 200, fixtureEvent());
  }
  if (request.url === "/jmap/api" && request.method === "POST") {
    const input = await body(request);
    const methodResponses = input.methodCalls.map(([method, args, id]) => {
      if (method === "Mailbox/get") return [method, { list: args.accountId === SHARED_ACCOUNT
        ? [{ id: SHARED_INBOX, name: "Inbox", role: "inbox", totalEmails: 1, unreadEmails: 1 }]
        : [
          { id: INBOX, name: "Inbox", role: "inbox", totalEmails: Number(fixtureMailbox === INBOX), unreadEmails: 1, "x-tastemail-usedBytes": 2097152, "x-tastemail-quotaBytes": 10737418240 },
          { id: ARCHIVE, name: "Archive", role: "archive", totalEmails: Number(fixtureMailbox === ARCHIVE), unreadEmails: 0 },
          { id: SPAM, name: "Spam", role: "junk", totalEmails: Number(fixtureMailbox === SPAM), unreadEmails: 0 },
          { id: TRASH, name: "Trash", role: "trash", totalEmails: Number(fixtureMailbox === TRASH), unreadEmails: 0 },
          { id: CUSTOM, name: "Project", role: null, totalEmails: 1, unreadEmails: 0 },
        ] }, id];
      if (method === "Email/query") {
        const methodError = {
          "jmap-forbidden": "forbidden",
          "jmap-account-inaccessible": "accountNotFound",
          "jmap-rate-limit": "rateLimit",
          "jmap-server-fail": "serverFail",
        }[args.filter?.text];
        if (methodError) return ["error", { type: methodError }, id];
        if (args.filter?.text) assert.ok(["한글 special & search", "인프라 예산"].includes(args.filter.text));
        if (args.filter?.operator === "AND") {
          const conditions = args.filter.conditions;
          if (conditions[0]?.from) assert.deepEqual(conditions, [{ from: "alice@example.test" }, { hasAttachment: true }]);
          else if (conditions[0]?.inMailbox) assert.deepEqual(conditions, [{ inMailbox: INBOX }, { text: "fixture" }]);
          else if (conditions.length === 2 && conditions[1]?.inMailbox === CUSTOM) assert.deepEqual(conditions, [{ text: "fixture" }, { inMailbox: CUSTOM }]);
          else assert.deepEqual(conditions, [
            { text: "fixture" }, { inMailbox: INBOX }, { after: "2026-09-01T00:00:00.000Z" }, { hasAttachment: true },
          ]);
        }
        const matches = Object.keys(args.filter ?? {}).length === 0 || args.filter?.text || args.filter?.operator === "AND" ||
          args.filter?.inMailbox === (args.accountId === SHARED_ACCOUNT ? SHARED_INBOX : fixtureMailbox) ||
          (args.accountId === ACCOUNT && args.filter?.inMailbox === CUSTOM);
        return [method, { ids: matches && args.position === 0 ? [EMAIL] : [], position: args.position, total: Number(Boolean(matches)) }, id];
      }
      if (method === "Email/get") return [method, { state: "7", list: args.ids.includes(EMAIL) ? [{ id: EMAIL, mailboxIds: { [fixtureMailbox]: true, [CUSTOM]: true }, from: [{ name: "Alice", email: "alice@example.test" }], to: [{ email: "fixture@example.test" }], subject: "Fixture", preview: "Synthetic content", receivedAt: "2026-09-28T00:00:00Z", keywords: { $seen: fixtureSeen, $flagged: fixtureStarred }, bodyValues: { "1": { value: "Synthetic text only" } }, attachments: [{ blobId: ATTACHMENT, name: "fixture.txt", type: "text/plain", size: 2048, disposition: "attachment", cid: null }] }] : [] }, id];
      if (method === "Email/set") {
        assert.equal(args.accountId, ACCOUNT);
        const [[messageId, patch]] = Object.entries(args.update);
        if (messageId === SERVER_FAIL_EMAIL) return [method, { updated: {}, notUpdated: { [messageId]: { type: "serverFail" } } }, id];
        if (messageId !== EMAIL) return [method, { updated: {}, notUpdated: { [messageId]: { type: "notFound" } } }, id];
        if (Object.hasOwn(patch, "keywords/$seen")) fixtureSeen = patch["keywords/$seen"];
        if (Object.hasOwn(patch, "keywords/$flagged")) fixtureStarred = patch["keywords/$flagged"];
        const targets = Object.entries(patch).filter(([key, value]) => key.startsWith("mailboxIds/") && value === true);
        if (targets.length) {
          assert.equal(args.ifInState, "7");
          assert.equal(Object.hasOwn(patch, `mailboxIds/${CUSTOM}`), false);
          if (staleMove) {
            staleMove = false;
            return ["error", { type: "stateMismatch" }, id];
          }
          assert.equal(targets.length, 1);
          assert.equal(patch[`mailboxIds/${fixtureMailbox}`], fixtureMailbox === targets[0][0].slice(11) ? true : false);
          fixtureMailbox = targets[0][0].slice(11);
        }
        return [method, { updated: { [EMAIL]: null }, notUpdated: {} }, id];
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
let mockApp;
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
  const liveApprovalsHtml = await (await fetch(`${origin}/ko/approvals`)).text();
  assert.equal(liveApprovalsHtml.includes("2026 상반기 클라우드 인프라 증설 예산 승인 요청"), false);

  const healthy = await fetch(`${origin}/api/mail/health`);
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), { status: "ok" });
  healthAvailable = false;
  const unhealthy = await fetch(`${origin}/api/mail/health`);
  assert.equal(unhealthy.status, 503);
  assert.equal((await unhealthy.json()).status, "retryable");
  healthAvailable = true;

  const unauthenticated = await fetch(`${origin}/api/mail/messages?folder=inbox`);
  assert.equal(unauthenticated.status, 401);
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
  const unauthenticatedQuarantine = await fetch(`${origin}/api/mail/quarantine`);
  assert.equal(unauthenticatedQuarantine.status, 401);
  const unauthenticatedQuarantineDetail = await fetch(`${origin}/api/mail/quarantine/${QUARANTINE}`);
  assert.equal(unauthenticatedQuarantineDetail.status, 401);
  const unauthenticatedSharedMessages = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}`);
  assert.equal(unauthenticatedSharedMessages.status, 401);
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

  for (const [tokenValue, httpStatus, status] of [
    ["expired-token", 401, "unauthorized"],
    ["forbidden-token", 403, "forbidden"],
    ["limited-token", 429, "rateLimited"],
    ["unavailable-token", 503, "retryable"],
  ]) {
    const testCookie = `gxwebmail_tastemail_session=${tokenValue}`;
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
  assert.deepEqual(await session.json(), { mode: "live", authenticated: true, username: "fixture@example.test" });
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
  const shared = await fetch(`${origin}/api/mail/shared-mailboxes`, { headers: { cookie } });
  assert.equal(shared.status, 200);
  const sharedItems = (await shared.json()).items;
  assert.equal(sharedItems[0].address, "team@example.test");
  assert.deepEqual(sharedItems[0].rights, { mayRead: true, mayWrite: false, maySend: true, mayManage: false });
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
  const sharedPage = await sharedMessages.json();
  assert.equal(sharedPage.accountId, SHARED_ACCOUNT);
  assert.equal(sharedPage.mailboxId, SHARED_INBOX);
  assert.equal(sharedPage.messages[0].subject, "Fixture");
  const sharedDownload = await fetch(`${origin}/api/mail/attachments?blobId=${encodeURIComponent(ATTACHMENT)}&accountId=${SHARED_ACCOUNT}`, { headers: { cookie } });
  assert.equal(sharedDownload.status, 200);
  assert.equal(await sharedDownload.text(), "synthetic-attachment");
  const foreignDownload = await fetch(`${origin}/api/mail/attachments?blobId=${encodeURIComponent(ATTACHMENT)}&accountId=44444444-4444-4444-8444-444444444444`, { headers: { cookie } });
  assert.equal(foreignDownload.status, 403);
  const foreignAccount = await fetch(`${origin}/api/mail/shared-messages?accountId=${ACCOUNT}`, { headers: { cookie } });
  assert.equal(foreignAccount.status, 403);
  const foreignMailbox = await fetch(`${origin}/api/mail/shared-messages?accountId=${SHARED_ACCOUNT}&mailboxId=${INBOX}`, { headers: { cookie } });
  assert.equal(foreignMailbox.status, 403);
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
  assert.equal((await updateEvent({ ...eventUpdate, expectedRevision: 2 })).status, 403);
  assert.equal(eventMutationCalls, 1);
  assert.equal((await cancelEvent({ expectedRevision: 2, currentStartsAt: eventUpdate.currentStartsAt })).status, 200);
  assert.equal(eventMutationCalls, 2);

  const first = await fetch(`${origin}/api/mail/messages?folder=inbox&position=0`, { headers: { cookie } });
  assert.equal(first.status, 200);
  const page = await first.json();
  assert.equal(page.mailboxId, INBOX);
  assert.equal(page.mailboxes[0].usedBytes, 2097152);
  assert.equal(page.mailboxes[0].quotaBytes, 10737418240);
  assert.equal(page.total, 1);
  assert.equal(page.messages[0].from.name, "Alice");
  assert.deepEqual(page.messages[0].body, ["Synthetic text only"]);
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

  const search = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("  한글 special & search  ")}`, { headers: { cookie } });
  assert.equal(search.status, 200);
  const searchPage = await search.json();
  assert.equal(searchPage.total, 1);
  assert.equal(searchPage.messages[0].mailboxName, "Inbox");
  assert.equal(searchPage.messages[0].subject, "Fixture");
  const phraseSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent('"인프라 예산"')}`, { headers: { cookie } });
  assert.equal(phraseSearch.status, 200);
  assert.equal((await phraseSearch.json()).total, 1);
  const operatorSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("from:alice@example.test has:attachment")}`, { headers: { cookie } });
  assert.equal(operatorSearch.status, 200);
  assert.equal((await operatorSearch.json()).total, 1);
  const folderSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("in:inbox fixture")}`, { headers: { cookie } });
  assert.equal(folderSearch.status, 200);
  assert.equal((await folderSearch.json()).total, 1);
  const missingFolderSearch = await fetch(`${origin}/api/mail/search?q=${encodeURIComponent("in:unknown fixture")}`, { headers: { cookie } });
  assert.equal(missingFolderSearch.status, 200);
  assert.equal((await missingFolderSearch.json()).total, 0);
  const filteredSearchParams = new URLSearchParams({ q: "fixture", folder: "inbox", after: "2026-09-01T00:00:00.000Z", hasAttachment: "1" });
  const filteredSearch = await fetch(`${origin}/api/mail/search?${filteredSearchParams}`, { headers: { cookie } });
  assert.equal(filteredSearch.status, 200);
  assert.equal((await filteredSearch.json()).total, 1);
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

  async function move(messageId, target, overrideOrigin = origin) {
    return fetch(`${origin}/api/mail/move`, { method: "PATCH", headers: { cookie, "content-type": "application/json", origin: overrideOrigin }, body: JSON.stringify({ messageId, target }) });
  }
  assert.equal((await move(EMAIL, "archive", "https://unrelated.example.test")).status, 403);
  assert.equal((await move(EMAIL, "starred")).status, 400);
  assert.equal((await move("44444444-4444-4444-8444-444444444444", "archive")).status, 502);
  assert.equal(fixtureMailbox, INBOX);
  staleMove = true;
  const conflictedMove = await move(EMAIL, "archive");
  assert.equal(conflictedMove.status, 503);
  assert.equal((await conflictedMove.json()).status, "retryable");
  assert.equal(fixtureMailbox, INBOX);
  for (const [target, expectedMailbox] of [["archive", ARCHIVE], ["spam", SPAM], ["trash", TRASH], ["inbox", INBOX]]) {
    const response = await move(EMAIL, target);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "updated" });
    assert.equal(fixtureMailbox, expectedMailbox);
    const movedPage = await fetch(`${origin}/api/mail/messages?folder=${target}`, { headers: { cookie } });
    assert.equal(movedPage.status, 200);
    assert.equal((await movedPage.json()).messages[0].id, EMAIL);
  }

  const logout = await fetch(`${origin}/api/mail/session`, { method: "DELETE", headers: { cookie, origin } });
  assert.equal(logout.status, 200);
  assert.equal((await logout.json()).status, "signed_out");

  const mockPort = await freePort();
  const mockOrigin = `http://127.0.0.1:${mockPort}`;
  mockApp = spawn(process.execPath, [resolve(projectRoot, "node_modules/next/dist/bin/next"), "start", "-p", String(mockPort)], {
    cwd: projectRoot,
    env: { ...process.env, GXWEBMAIL_DATA_MODE: "mock" },
    stdio: "ignore",
  });
  let mockReady = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (mockApp.exitCode !== null) throw new Error("Mock Next.js exited before it became ready");
    try {
      const response = await fetch(`${mockOrigin}/ko/approvals`);
      if (response.ok) {
        const html = await response.text();
        assert.equal(html.includes("2026 상반기 클라우드 인프라 증설 예산 승인 요청"), true);
        mockReady = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  if (!mockReady) throw new Error("Mock Next.js did not become ready");
  const mockRules = await fetch(`${mockOrigin}/api/mail/rules`);
  assert.equal(mockRules.status, 404);
  console.log("Synthetic TASTEMAIL session and JMAP read/write contract: passed");
} finally {
  if (mockApp && mockApp.exitCode === null) {
    mockApp.kill();
    await Promise.race([new Promise((resolveExit) => mockApp.once("exit", resolveExit)), delay(2_000)]);
  }
  if (app && app.exitCode === null) {
    app.kill();
    await Promise.race([new Promise((resolveExit) => app.once("exit", resolveExit)), delay(2_000)]);
  }
  api.closeAllConnections();
  await new Promise((resolveClose) => api.close(resolveClose));
}
