// Compiled BFF verification against a synthetic loopback server only.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { adminOverviewFixture } from "./fixtures/admin-overview.mjs";
import { managementFields } from "../lib/tastemail/admin-management.ts";
import { adminDkimFixture } from "./fixtures/admin-dkim.mjs";
import { adminRemoteFixture } from "./fixtures/admin-remote.mjs";
import { randomUUID } from "node:crypto";
const root = fileURLToPath(new URL("..", import.meta.url));
const sharedOnly = process.argv.includes("--shared");
const auditOnly = process.argv.includes("--audit");
const queuePageOnly = process.argv.includes("--queue-page");
const queueOnly = process.argv.includes("--queue") || queuePageOnly;
const usageOnly = process.argv.includes("--usage") || process.argv.includes("--usage-ssr");
const serveUi = process.argv.includes("--serve-ui");
const policyOnly = process.argv.includes("--spam-policy");
const initialOnly = process.argv.includes("--initial-ssr");
const dkimOnly = process.argv.includes("--dkim");
const remoteOperationsOnly = process.argv.includes("--remote-operations");
const remoteConfigurationOnly = process.argv.includes("--remote-configuration");
const remoteOnly = process.argv.includes("--remote") || remoteOperationsOnly || remoteConfigurationOnly;
const policyFixture = { ...Object.fromEntries(managementFields("spam-policy", "edit").map(field => [field.name, field.type === "boolean" ? true : field.type === "list" ? [] : field.type === "nullableNumber" ? null : field.name === "maxContentScanChars" ? 4096 : 1])), revision: 1, source: "database", updatedAt: "2026-10-12T00:00:00Z" };
const sharedId = "11111111-1111-4111-8111-111111111111";
const grant = { id: "22222222-2222-4222-8222-222222222222", kind: "user", address: "delegate@example.test", rights: { mayRead: true, mayWrite: true, maySend: true, mayManage: true } };
const sharedMailbox = { id: sharedId, address: "team@example.test", displayName: "Synthetic team", quotaBytes: serveUi ? 10 * 1024 ** 3 : 100, usedBytes: serveUi ? 512 * 1024 ** 2 : 4, revision: 1, rights: grant.rights };
const otherSharedMailbox = { ...sharedMailbox, id: grant.id, address: "support@example.test", displayName: "Synthetic support" };
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
let upstreamStatus = 200, malformed = false, reads = 0;
const auditQueries = [];
const queueQueries = [];
const remoteWrites=[],remoteJobs=new Map();let latestRemoteJob=null;
const api = createServer((request, response) => {
  const reply = (status, payload) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(payload)); };
  if (request.method === "POST" && request.url === "/api/auth/session") return reply(200, { accessToken: "synthetic-admin-operations-token", tokenType: "Bearer", expiresAt: new Date(Date.now() + 3600000).toISOString() });
  if ((serveUi || usageOnly || initialOnly || remoteOnly) && request.method === "GET" && request.url === "/.well-known/jmap") return reply(200, { apiUrl: "/jmap/api", username: "qa@example.test", primaryAccounts: { "urn:ietf:params:jmap:mail": sharedId }, accounts: { [sharedId]: { name: "Synthetic QA", isPersonal: true, accountCapabilities: { "urn:ietf:params:jmap:mail": {} } } } });
  if ((serveUi || initialOnly) && request.method === "GET" && request.url?.startsWith("/api/admin/users?")) {
    const domain = new URL(request.url, "http://localhost").searchParams.get("domain") ?? "example.test";
    return reply(200, { items: [{ id: sharedId, address: `qa@${domain}`, displayName: "Synthetic QA", enabled: true, isAdmin: false, usedBytes: "1024", quotaBytes: "10737418240", submissionMessagesPerHour: null }], hasMore: false, nextAfterAddress: null, nextAfterId: null });
  }
  if ((serveUi || initialOnly) && request.method === "GET" && request.url?.startsWith("/api/admin/groups?")) return reply(200, { items: [{ id: sharedId, address: "team@example.test", displayName: "Synthetic team", enabled: true, permissionOnly: true, members: ["first@example.test", "second@example.test"] }] });
  if ((serveUi || initialOnly) && request.method === "GET" && request.url?.startsWith("/api/admin/domains?")) return reply(200, { limit: 1000, items: [{ id: sharedId, name: "example.test", active: true }, { id: grant.id, name: "other.test", active: true }, { id: "33333333-3333-4333-8333-333333333333", name: "inactive.test", active: false }] });
  if ((serveUi || dkimOnly || initialOnly) && request.method === "GET" && request.url?.startsWith("/api/admin/dkim?")) {
    reads++; assert.ok(request.headers.authorization === "Bearer synthetic-admin-operations-token", "Synthetic authentication expected");
    if (upstreamStatus !== 200) return reply(upstreamStatus, { status: "synthetic-error" });
    const domain = new URL(request.url, "http://127.0.0.1").searchParams.get("domain").toLowerCase().replace(/\.$/, "");
    return reply(200, malformed ? { keys: [] } : { ...adminDkimFixture(domain), privateKey: "must-not-project" });
  }
  if ((serveUi || initialOnly) && request.method === "GET" && request.url?.startsWith("/api/admin/quarantine?")) return reply(200, { items: [{ id: sharedId, recipient: "qa@example.test", envelopeSender: null, subject: "Synthetic quarantine", sizeBytes: "1024", spamScore: 10, spamRules: ["synthetic-only"], createdAt: "2026-10-12T00:00:00Z", body: "must-not-project" }], hasMore: false, nextBeforeCreatedAt: null, nextBeforeId: null });
  if ((serveUi || remoteOnly) && request.method === "GET" && request.url === "/api/admin/management") {
    reads++; assert.ok(request.headers.authorization === "Bearer synthetic-admin-operations-token", "Synthetic authentication expected");
    const fixture=adminRemoteFixture();
    if(remoteConfigurationOnly && upstreamStatus === 501) return reply(501,{code:"management_not_configured",privatePath:"must-not-project"});
    if(serveUi){fixture.operation=latestRemoteJob?remoteJobs.get(latestRemoteJob).receipt:null;fixture.node.sharedDatabaseVerified=true;fixture.updates.rollbackSafe=true;fixture.updates.availableVersion="0.1.38";fixture.updates.rollbackVersion="0.1.36";}
    return reply(upstreamStatus, malformed ? {} : { ...fixture, privatePath: "must-not-project" });
  }
  if((serveUi||remoteOperationsOnly||remoteConfigurationOnly)&&request.url?.startsWith("/api/admin/management/operations")){
    assert.ok(request.headers.authorization==="Bearer synthetic-admin-operations-token","Synthetic authentication expected");
    if(upstreamStatus!==200)return reply(upstreamStatus,{code:remoteConfigurationOnly && upstreamStatus === 501 ? "management_not_configured" : "synthetic_error"});
    if(request.method==="POST"&&request.url==="/api/admin/management/operations"){
      let body="";request.on("data",chunk=>{body+=chunk;});request.on("end",()=>{const input=JSON.parse(body);const previous=[...remoteJobs.values()].find(job=>job.input.requestId===input.requestId);if(previous){if(JSON.stringify(previous.input)!==JSON.stringify(input))return reply(409,{code:"idempotency_conflict"});return reply(202,previous.receipt);}
        remoteWrites.push(input);const id=randomUUID(),receipt={id,phase:"accepted",updatedAt:new Date().toISOString(),error:null};remoteJobs.set(id,{input,receipt,reads:0});latestRemoteJob=id;reply(202,malformed?{}:receipt);
      });return;
    }
    if(request.method==="GET"){const id=request.url.split("/").at(-1),job=remoteJobs.get(id);if(!job)return reply(404,{code:"operation_not_found"});job.reads++;job.receipt={...job.receipt,phase:job.reads===1?"running":"succeeded",updatedAt:new Date().toISOString()};return reply(200,malformed?{...job.receipt,id:sharedId}:job.receipt);}
    return reply(404,{code:"not_found"});
  }
  if ((serveUi || policyOnly || initialOnly) && request.method === "GET" && request.url?.startsWith("/api/admin/spam-policy")) {
    reads++; assert.ok(request.headers.authorization === "Bearer synthetic-admin-operations-token", "Synthetic authentication expected");
    if (upstreamStatus !== 200) return reply(upstreamStatus, { status: "synthetic-error" });
    return reply(200, malformed ? { revision: 1, source: "database", updatedAt: null } : { ...policyFixture, internalCredential: "must-not-project" });
  }
  if (request.method === "GET" && request.url?.startsWith("/api/admin/product?")) {
    reads++; assert.ok(request.headers.authorization === "Bearer synthetic-admin-operations-token", "Synthetic authentication expected");
    if (upstreamStatus !== 200) return reply(upstreamStatus, { status: "synthetic-error" });
    return reply(200, { usage: malformed ? {} : { totalDomains: 9, totalUsers: 12, totalSharedMailboxes: 3, usedBytes: 1536, quotaBytes: 1048576, domains: [{ domainId: sharedId, domain: "example.test", users: 2, sharedMailboxes: 1, usedBytes: 1536, quotaBytes: 1048576 }], users: [{ userId: sharedId, address: "qa@example.test", displayName: "Synthetic usage", shared: true, usedBytes: 1536, quotaBytes: 1048576 }] }, secret: "must-not-project" });
  }
  if (request.method === "GET" && request.url?.startsWith("/api/admin/audit?")) {
    reads++; auditQueries.push(request.url);
    assert.ok(request.headers.authorization === "Bearer synthetic-admin-operations-token", "Synthetic authentication expected");
    if (serveUi && new URL(request.url, "http://127.0.0.1").searchParams.get("eventType") === "fixture.bad_query") return reply(400, { status: "invalid_request" });
    if (upstreamStatus !== 200) return reply(upstreamStatus, { status: "synthetic-error" });
    return reply(200, { hasMore: false, nextBeforeId: null, limit: 50, items: [{ id: "123", occurredAt: "2026-10-12T00:00:00Z", eventType: "user.updated", actorUserId: sharedId, actorAddress: "qa@example.test", targetType: "user", targetId: sharedId, remoteAddress: "127.0.0.1", detail: { enabled: true, count: 3, secret: "must-not-project", body: "must-not-project" } }] });
  }
  if (request.url?.startsWith("/api/admin/queue")) {
    if (request.method === "GET") queueQueries.push(request.url);
    reads++; assert.ok(request.headers.authorization === "Bearer synthetic-admin-operations-token", "Synthetic authentication expected");
    if (upstreamStatus !== 200) return reply(upstreamStatus, { status: "synthetic-error" });
    if (request.method === "GET") return reply(200, { hasMore: false, items: [{ id: sharedId, messageId: grant.id, recipient: "qa@example.test", envelopeSender: null, status: serveUi && ["failed", "delivered", "cancelled", "in_progress", "deferred"].includes(new URL(request.url, "http://127.0.0.1").searchParams.get("status")) ? new URL(request.url, "http://127.0.0.1").searchParams.get("status") : "pending", attemptCount: 1, nextAttemptAt: "2026-10-12T00:00:00Z", expiresAt: "2026-10-13T00:00:00Z", createdAt: "2026-10-11T00:00:00Z", lastSmtpCode: 451, lastError: "synthetic-deferred", body: "must-not-project" }] });
    if (request.method === "POST" && request.url === `/api/admin/queue/${sharedId}/retry`) return reply(200, malformed ? { id: sharedId } : { id: sharedId, previousStatus: "pending", nextAttemptAt: "2026-10-12T00:00:00Z" });
    if (request.method === "POST" && request.url === `/api/admin/queue/${sharedId}/cancel`) return reply(200, malformed ? { id: sharedId } : { id: sharedId, previousStatus: "pending", cancelledAt: "2026-10-12T00:00:00Z" });
    return reply(404, { status: "not_found" });
  }
  if (request.method === "GET" && request.url === "/api/admin/operations") {
    reads++;
    assert.ok(request.headers.authorization === "Bearer synthetic-admin-operations-token", "Synthetic authentication expected");
    return reply(upstreamStatus, malformed ? { metrics: null } : { ...adminOverviewFixture, internalCredential: "must-not-project" });
  }
  if (request.url?.startsWith("/api/admin/shared-mailboxes")) {
    reads++; assert.ok(request.headers.authorization === "Bearer synthetic-admin-operations-token", "Synthetic authentication expected");
    if (upstreamStatus !== 200) return reply(upstreamStatus, { status: "synthetic-error" });
    if (request.method === "GET") return reply(200, request.url === "/api/admin/shared-mailboxes" ? { items: serveUi ? [sharedMailbox, otherSharedMailbox] : [sharedMailbox] } : { mailbox: serveUi && request.url.endsWith(otherSharedMailbox.id) ? otherSharedMailbox : sharedMailbox, grants: [grant] });
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      const input = JSON.parse(body);
      if (request.method === "PUT") { assert.equal(input.expectedRevision, 1); assert.equal(input.grants[0].mayManage, true); assert.equal(input.grants[0].id, undefined); return reply(200, { revision: 2 }); }
      assert.equal(input.quotaBytes, "10737418240"); return reply(200, { id: sharedId });
    });
    return;
  }
  return reply(404, { status: "not_found" });
});
let app;
try {
  const apiPort = await listen(api);
  const reservation = createServer(); const webPort = await listen(reservation); await new Promise(resolve => reservation.close(resolve));
  // Browser cookies are scoped by hostname, not port. Keep QA off the user's 127.0.0.1 cookie jar.
  const webHost = serveUi ? "localhost" : "127.0.0.1";
  const origin = `http://${webHost}:${webPort}`;
  app = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "-H", webHost, "-p", String(webPort)], { cwd: root, env: { ...process.env, TASTEMAIL_API_URL: `http://127.0.0.1:${apiPort}` }, stdio: ["ignore", "pipe", "pipe"] });
  let startupOutput = "", readinessStatus = null;
  const recordStartup = chunk => { startupOutput = (startupOutput + String(chunk)).slice(-4000); };
  app.stdout.on("data", recordStartup); app.stderr.on("data", recordStartup);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) throw new Error("Validation server exited");
    try { readinessStatus = (await fetch(`${origin}/api/mail/session`)).status; if (readinessStatus === 401) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.equal(ready, true, `Synthetic QA startup failed (HTTP ${readinessStatus}): ${startupOutput}`);
  if (serveUi) {
    console.log(`SYNTHETIC_ADMIN_QA_URL=${origin}/ko/login`);
    console.log("Synthetic loopback only. Send stop on stdin to close both validation servers.");
    await new Promise(resolve => { process.stdin.once("data", resolve); });
    process.stdin.pause();
  } else {
  const path = remoteOnly ? "/api/mail/admin/management" : dkimOnly ? "/api/mail/admin/manage/dkim?domain=example.test" : policyOnly ? "/api/mail/admin/manage/spam-policy" : usageOnly ? "/api/mail/admin/manage/reports" : queueOnly ? "/api/mail/admin/manage/queue" : auditOnly ? "/api/mail/admin/manage/audit" : sharedOnly ? "/api/mail/admin/shared-mailboxes" : "/api/mail/admin/operations";
  assert.equal((await fetch(`${origin}${path}`)).status, 401); assert.equal(reads, 0);
  const login = await fetch(`${origin}/api/mail/session`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ username: "qa@example.test", password: "synthetic-password-only" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); assert.ok(cookie);
  if (remoteConfigurationOnly) {
    upstreamStatus=501;
    const result=await fetch(`${origin}${path}`,{headers:{cookie}});
    assert.equal(result.status,501);assert.equal(result.headers.get("cache-control"),"private, no-store");
    assert.deepEqual(await result.json(),{status:"managementNotConfigured"});
    const document=await fetch(`${origin}/ko/admin/system`,{headers:{cookie}});
    assert.equal(document.status,200);
    const initialPayload=(await document.text()).replaceAll('\\\"','"');
    assert.ok(initialPayload.includes('"initialError":"managementNotConfigured"'));
    assert.ok(!initialPayload.includes('"initialError":"unsupported"'));
    const command={requestId:randomUUID(),expectedRevision:"a".repeat(64),confirmed:true,change:{kind:"update",values:{action:"check"}}};
    const submission=await fetch(`${origin}/api/mail/admin/management/operations`,{method:"POST",headers:{cookie,origin,"content-type":"application/json"},body:JSON.stringify(command)});
    assert.equal(submission.status,501);assert.deepEqual(await submission.json(),{status:"managementNotConfigured"});
    assert.equal(remoteWrites.length,0);
    console.log("Compiled configuration-only gate: GET/SSR initial state/POST distinguish an unconfigured server, no raw details or accepted jobs. Shared error toast remains client-rendered. Synthetic loopback only.");
  } else if (remoteOnly) {
    const response = await fetch(`${origin}${path}`, { headers: { cookie } }); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    const data = await response.json(); assert.equal(data.operation.phase, "accepted"); assert.ok(!JSON.stringify(data).includes("must-not-project"));
    const document = await fetch(`${origin}/ko/admin/system`, { headers: { cookie } }); const html = (await document.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""); assert.ok(html.includes("127.0.0.1:6711")); assert.ok(html.includes("접수됨"));
    if(remoteOperationsOnly){
      const command={requestId:randomUUID(),expectedRevision:"a".repeat(64),confirmed:true,change:{kind:"network",values:{webmailPort:6710,apiPort:6711,webmailListenHost:"127.0.0.1",apiListenHost:"127.0.0.1",publicListenerConfirmed:false}}};
      const post=(body,originHeader=origin)=>fetch(`${origin}/api/mail/admin/management/operations`,{method:"POST",headers:{cookie,origin:originHeader,"content-type":"application/json"},body:JSON.stringify(body)});
      assert.equal((await post(command,"https://evil.example.test")).status,403);assert.equal(remoteWrites.length,0);
      assert.equal((await post({...command,confirmed:false})).status,400);assert.equal(remoteWrites.length,0);
      const accepted=await post(command);assert.equal(accepted.status,202);assert.equal(accepted.headers.get("cache-control"),"private, no-store");const receipt=await accepted.json();assert.equal(receipt.phase,"accepted");assert.notEqual(receipt.id,command.requestId);
      assert.equal((await post(command)).status,202);assert.equal(remoteWrites.length,1);
      const progress=()=>fetch(`${origin}/api/mail/admin/management/operations/${receipt.id}`,{headers:{cookie}});
      assert.equal((await (await progress()).json()).phase,"running");assert.equal((await (await progress()).json()).phase,"succeeded");
      malformed=true;assert.equal((await progress()).status,503);malformed=false;
      for(const status of [401,403,409,429,501]){upstreamStatus=status;assert.equal((await post({...command,requestId:randomUUID()})).status,status);}upstreamStatus=200;
      malformed=true;assert.equal((await post({...command,requestId:randomUUID()})).status,503);malformed=false;
      console.log("Compiled synthetic job dispatch: origin/confirmation, 202 acceptance, idempotency, job-bound running/completed status, mismatch/uncertainty and authorization passed. No operating server changes.");
    }
    for (const status of [401,403,429]) { upstreamStatus=status; assert.equal((await fetch(`${origin}${path}`,{headers:{cookie}})).status,status); }
    upstreamStatus=404; assert.equal((await fetch(`${origin}${path}`,{headers:{cookie}})).status,501);
    upstreamStatus=200; malformed=true; assert.equal((await fetch(`${origin}${path}`,{headers:{cookie}})).status,502);
    console.log("Compiled remote management: closed status DTO, SSR, private no-store, auth/limit/unsupported/malformed states passed. No operating server changes.");
  } else if (dkimOnly) {
    const result = await fetch(`${origin}${path}`, { headers: { cookie } }); assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "private, no-store");
    const data = await result.json(); assert.equal(data.dkim.records.length, 4); assert.equal(data.items[0].activatedAt, null); assert.ok(!JSON.stringify(data).includes("must-not-project"));
    const disabled = await fetch(`${origin}/api/mail/admin/manage/dkim?domain=unconfigured.example.test`, { headers: { cookie } }); assert.equal((await disabled.json()).dkim.keyGenerationConfigured, false);
    for (const status of [401, 403, 429]) { upstreamStatus = status; assert.equal((await fetch(`${origin}${path}`, { headers: { cookie } })).status, status); }
    upstreamStatus = 200; malformed = true; assert.equal((await fetch(`${origin}${path}`, { headers: { cookie } })).status, 502);
    console.log("Compiled DKIM BFF: complete DNS/lifecycle projection, explicit generation readiness, private no-store, 401/403/429 and incomplete-response rejection passed. No key mutation.");
  } else if (initialOnly) {
    for (const [section, marker, tag] of [["users", "Synthetic QA", "<table"], ["groups", "Synthetic team", "<table"], ["shared-mailboxes", "Synthetic team", "<table"], ["quarantine", "Synthetic quarantine", "<table"], ["queue", "qa@example.test", "<table"], ["spam-policy", "4,096", "<dl"], ["reports", "Synthetic usage", "<table"]]) {
      const document = await fetch(`${origin}/ko/admin/${section}`, { headers: { cookie } }); assert.equal(document.status, 200, section);
      const html = await document.text(); const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
      assert.ok(visible.includes(marker), `${section}: initial data must be rendered outside RSC scripts`); assert.ok(visible.includes(tag), `${section}: actual initial markup required`);
      assert.ok(!html.includes("must-not-project"), `${section}: private raw fields`);
    }
    const dkimDocument = await fetch(`${origin}/ko/admin/dkim?domain=other.test`, { headers: { cookie } });
    const dkimHtml = (await dkimDocument.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    assert.ok(dkimHtml.includes("synthetic-qa")); assert.ok(dkimHtml.includes("synthetic-qa._domainkey.other.test")); assert.ok(dkimHtml.includes("<table")); assert.ok(!dkimHtml.includes("inactive.test"));
    malformed = true;
    const invalid = await fetch(`${origin}/ko/admin/spam-policy`, { headers: { cookie } }); const visible = (await invalid.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    assert.ok(!visible.includes("4,096")); assert.ok(!visible.includes("스팸 판정 점수"));
    console.log("Initial compiled administrator HTML: eight section data tables/policy render before JavaScript, selected DKIM domain included; malformed policy does not render defaults. Synthetic loopback only.");
  } else if (policyOnly) {
    const response = await fetch(`${origin}${path}`, { headers: { cookie } }); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    const data = await response.json(); assert.equal(data.singleton.enabled, true); assert.equal(data.singleton.quarantineThreshold, null); assert.equal(data.singleton.maxContentScanChars, 4096); assert.ok(!JSON.stringify(data).includes("must-not-project"));
    for (const status of [401, 403, 429]) { upstreamStatus = status; assert.equal((await fetch(`${origin}${path}`, { headers: { cookie } })).status, status); }
    upstreamStatus = 200; malformed = true; const rejected = await fetch(`${origin}${path}`, { headers: { cookie } }); assert.equal(rejected.status, 502); assert.equal((await rejected.json()).status, "unavailable");
    console.log("Compiled spam policy BFF: closed projection, nullable values, private no-store, 401/403/429 and incomplete-data rejection passed. Synthetic loopback only.");
  } else if (usageOnly) {
    if (!process.argv.includes("--usage-ssr")) {
    const list = await fetch(`${origin}${path}`, { headers: { cookie } }); assert.equal(list.status, 200); assert.equal(list.headers.get("cache-control"), "private, no-store");
    const data = await list.json(); assert.equal(data.usage.totalDomains, 9); assert.equal(data.usage.users[0].displayName, "Synthetic usage"); assert.ok(!JSON.stringify(data).includes("must-not-project"));
    }
    const document = await fetch(`${origin}/ko/admin/reports`, { headers: { cookie } }); assert.equal(document.status, 200);
    const html = await document.text(); assert.ok(html.includes("Synthetic usage")); assert.ok(html.includes("<table")); assert.ok(!html.includes("must-not-project"));
    for (const status of [401, 403, 429]) { upstreamStatus = status; assert.equal((await fetch(`${origin}${path}`, { headers: { cookie } })).status, status); }
    upstreamStatus = 200; malformed = true; assert.equal((await fetch(`${origin}${path}`, { headers: { cookie } })).status, 502);
    console.log("Compiled usage BFF and initial SSR HTML: totals/top users, safe projection, no-store, 401/403/429 and malformed data passed. Synthetic loopback only.");
  } else if (queueOnly) {
    const list = await fetch(`${origin}${path}`, { headers: { cookie } }); assert.equal(list.status, 200);
    const data = await list.json(); assert.equal(data.items[0].messageId, grant.id); assert.equal(data.items[0].lastSmtpCode, 451); assert.ok(!JSON.stringify(data).includes("must-not-project"));
    if (queuePageOnly) {
      const cursor = new URLSearchParams({ status: "all", beforePriority: "1", beforeNextAttemptAt: "2026-10-12T00:00:00Z", beforeCreatedAt: "2026-10-11T00:00:00Z", beforeId: sharedId, unknown: "ignored" });
      assert.equal((await fetch(`${origin}${path}?${cursor}`, { headers: { cookie } })).status, 200);
      const received = new URL(queueQueries.at(-1), "http://127.0.0.1").searchParams;
      for (const [key, value] of cursor) if (key !== "unknown") assert.equal(received.get(key), value);
      assert.equal(received.has("unknown"), false);
      const previousReads = reads;
      for (const query of [`beforeId=${sharedId}`, "status=unknown", `beforePriority=2&beforeNextAttemptAt=2026-10-12T00:00:00Z&beforeCreatedAt=2026-10-11T00:00:00Z&beforeId=${sharedId}`]) { const invalid = await fetch(`${origin}${path}?${query}`, { headers: { cookie } }); assert.equal(invalid.status, 400); assert.equal((await invalid.json()).status, "invalid_request"); }
      assert.equal(reads, previousReads);
      console.log("Compiled queue read BFF: complete cursor and selected filter preserved, unknown query omitted, incomplete/out-of-range requests blocked before upstream. Synthetic loopback only.");
    } else {
    const mutate = action => fetch(`${origin}/api/mail/admin/manage`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ resource: "queue", action, id: sharedId, input: {}, confirmed: true }) });
    for (const action of ["retry", "cancel"]) {
      assert.equal((await mutate(action)).status, 200);
      malformed = true; const invalid = await mutate(action); assert.equal(invalid.status, 502); assert.equal((await invalid.json()).status, "mutationUncertain"); malformed = false;
    }
    upstreamStatus = 409; const conflict = await mutate("cancel"); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).status, "conflict");
    console.log("Compiled queue BFF: safe detail, retry/cancel receipts, malformed receipt uncertainty and conflicts passed. Synthetic loopback only.");
    }
  } else if (auditOnly) {
    const list = await fetch(`${origin}${path}?eventType=user.updated&actorUserId=${sharedId}&beforeId=999`, { headers: { cookie } });
    assert.equal(list.status, 200); assert.equal(list.headers.get("cache-control"), "private, no-store");
    const data = await list.json();
    assert.equal(data.items[0].actorUserId, sharedId); assert.equal(data.items[0].remoteAddress, "127.0.0.1");
    assert.deepEqual(JSON.parse(data.items[0].detailJson), { count: 3, enabled: true });
    assert.ok(!JSON.stringify(data).includes("must-not-project"));
    assert.equal(auditQueries[0], `/api/admin/audit?limit=50&eventType=user.updated&actorUserId=${sharedId}&beforeId=999`);
    const previousReads = reads;
    const invalidActor = await fetch(`${origin}${path}?actorUserId=invalid`, { headers: { cookie } }); assert.equal(invalidActor.status, 400); assert.equal((await invalidActor.json()).status, "invalid_request"); assert.equal(reads, previousReads);
    for (const status of [401, 403, 429]) { upstreamStatus = status; assert.equal((await fetch(`${origin}${path}`, { headers: { cookie } })).status, status); }
    console.log("Compiled audit BFF: actor/event/cursor filters, safe detail, no-store, invalid actor blocked before upstream and 401/403/429 passed. Synthetic loopback only.");
  } else if (sharedOnly) {
    const list = await fetch(`${origin}${path}`, { headers: { cookie } }); assert.equal(list.status, 200); assert.deepEqual(await list.json(), { items: [sharedMailbox] }); assert.equal(list.headers.get("cache-control"), "private, no-store");
    const detail = await fetch(`${origin}${path}?id=${sharedId}`, { headers: { cookie } }); assert.equal(detail.status, 200); assert.deepEqual(await detail.json(), { mailbox: sharedMailbox, grants: [grant] });
    const post = body => fetch(`${origin}${path}`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    const create = { action: "create", confirmed: true, input: { address: sharedMailbox.address, displayName: sharedMailbox.displayName, quotaBytes: "10737418240" } };
    const created = await post(create); assert.equal(created.status, 200); assert.deepEqual(await created.json(), { status: "updated", id: sharedId });
    const saved = await post({ action: "grants", id: sharedId, confirmed: true, expectedRevision: 1, grants: [grant] }); assert.equal(saved.status, 200); assert.deepEqual(await saved.json(), { status: "updated", revision: 2 });
    for (const [status, code] of [[402, "licenseLimit"], [403, "forbidden"], [404, "notFound"], [409, "conflict"]]) { upstreamStatus = status; const result = await post(create); assert.equal(result.status, status); assert.equal((await result.json()).status, code); }
    console.log("Compiled shared-mailbox BFF: list, stable grant ID, creation, revision-matched rights, no-store, license limit, denial and conflict passed. Synthetic loopback only.");
  } else {
  const allowed = await fetch(`${origin}/api/mail/admin/operations`, { headers: { cookie } });
  assert.equal(allowed.status, 200); assert.equal(allowed.headers.get("cache-control"), "private, no-store"); assert.deepEqual(await allowed.json(), adminOverviewFixture);
  for (const [status, expectedCode] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"]]) {
    upstreamStatus = status;
    const response = await fetch(`${origin}/api/mail/admin/operations`, { headers: { cookie } }); assert.equal(response.status, status); assert.equal((await response.json()).status, expectedCode);
  }
  upstreamStatus = 200; malformed = true;
  const invalid = await fetch(`${origin}/api/mail/admin/operations`, { headers: { cookie } }); assert.equal(invalid.status, 502); assert.equal((await invalid.json()).status, "unavailable");
  console.log("Compiled administrator operations BFF: authentication, full projection, no-store, denial, throttling and malformed receipt passed. Synthetic loopback only.");
  }
  }
} finally {
  if (app && app.exitCode === null) {
    await new Promise(resolve => { app.once("exit", resolve); app.kill(); });
  }
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
