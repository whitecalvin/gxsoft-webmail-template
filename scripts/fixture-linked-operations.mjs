import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { readFile, writeFile } from "node:fs/promises";
assert.ok(process.stdin.isTTY, "Browser fixture requires tty=true");
const id = "11111111-1111-4111-8111-111111111111", ownerId = "22222222-2222-4222-8222-222222222222", mail = "urn:ietf:params:jmap:mail";
const receipts = new Map(), inputs = [], counters = { queueAll: 0, resumePartial: 0, pause: 0, resume: 0, recover: 0 };
let app, controlRevision = 1, userPaused = false, childDiagnostic = "";
let completed = false;
const buildId = (await readFile(".next-admin-webpack-validation/BUILD_ID", "utf8")).trim();
async function checkpoint(phase) {
  await writeFile("docs/linked-operation-fixture-checkpoint-20261013.json", JSON.stringify({ syntheticOnly: true, buildId, phase, counters, userPaused, controlRevision, operations: inputs.length }, null, 2));
}
const readJson = async req => { let raw = ""; for await (const chunk of req) { raw += chunk; assert.ok(raw.length <= 49152); } return JSON.parse(raw); };
const api = createServer(async (req, res) => {
  const send = (body, status = 200) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
  try {
    if (req.url === "/api/auth/session" && req.method === "POST") {
      const login = await readJson(req);
      return login.username === "fixture@example.test" && login.password === "synthetic-only" ? send({ accessToken: "fixture-only", expiresAt: new Date(Date.now() + 600000).toISOString() }) : send({}, 401);
    }
    if (req.headers.authorization !== "Bearer fixture-only") return send({}, 401);
    if (req.url === "/.well-known/jmap") return send({ apiUrl: "/jmap/api", username: "fixture@example.test", primaryAccounts: { [mail]: ownerId }, accounts: { [ownerId]: { name: "Fixture", isPersonal: true, accountCapabilities: { [mail]: {} } } } });
    if (req.url === "/api/user/linked-accounts") return send({ accounts: [{ id, provider: "gmail", email: "synthetic@gmail.com", revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } }], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } });
    if (req.url === `/api/user/linked-accounts/${id}/operations` && req.method === "POST") {
      const input = await readJson(req); inputs.push(input);
      assert.equal(input.expectedRevision, 2); assert.equal(input.credentialGeneration, 1); assert.ok(!receipts.has(input.operationId));
      assert.ok(input.action.kind in counters); counters[input.action.kind]++;
      let folders, phase = "confirmed", prefix, result = null;
      if (input.action.kind === "queueAll") { assert.equal(counters.queueAll, 1); folders = ["INBOX", "A&-B"]; prefix = 1; phase = "partial"; }
      else if (input.action.kind === "resumePartial") {
        assert.equal(counters.resumePartial, 1); const parent = receipts.get(input.action.operationId);
        assert.equal(parent.phase, "partial"); assert.equal(parent.canResumePartial, true); assert.notEqual(input.action.operationId, input.operationId);
        folders = parent.folders.slice(parent.confirmedPrefix); prefix = folders.length; parent.resumedBy = input.operationId; parent.canResumePartial = false;
        result = { meaning: "reservationAccepted", remoteMutation: false };
      } else {
        assert.ok(["pause", "resume"].includes(input.action.kind)); assert.equal(input.action.folder, "INBOX"); assert.equal(input.action.expectedControlRevision, controlRevision);
        folders = [input.action.folder]; prefix = 1; userPaused = input.action.kind === "pause"; controlRevision++;
        result = { folder: "INBOX", userPaused, controlRevision, effect: "nextBatchCommit", cacheDeleted: false };
      }
      const receipt = { operationId: input.operationId, linkedAccountId: id, revision: 2, credentialGeneration: 1, action: input.action.kind, phase,
        folders, confirmedPrefix: prefix, canResumePartial: phase === "partial", resumedBy: null, result, expiresAt: "2026-10-20T00:00:00Z", encoding: "imapModifiedUtf7" };
      receipts.set(input.operationId, receipt); await checkpoint("operationAccepted"); return send(receipt, phase === "partial" ? 409 : 200);
    }
    if (req.url?.startsWith(`/api/user/linked-accounts/${id}/operations/`) && req.method === "GET") {
      counters.recover++; const receipt = receipts.get(req.url.split("/").at(-1)); await checkpoint("operationRead"); return receipt ? send(receipt) : send({ type: "notFound" }, 404);
    }
    if (req.url === `/api/user/linked-accounts/${id}/sync/jobs` && req.method === "GET") return send({ jobs: [{ folder: "INBOX", status: userPaused ? "paused" : "queued", attempts: 0, lastError: userPaused ? "userPaused" : null, userPaused, controlRevision, operationId: null }] });
    if (req.url === "/jmap/api" && req.method === "POST") {
      const request = await readJson(req);
      return send({ methodResponses: request.methodCalls.map(([name, , tag]) => [name, name === "Mailbox/get" ? { accountId: ownerId, list: [] } : { accountId: ownerId, ids: [], position: 0, total: 0 }, tag]) });
    }
    return send({}, 404);
  } catch (error) { console.error("Fixture contract assertion failed:", error.message); return send({ type: "fixtureFailure" }, 500); }
});
const listen = server => new Promise(ok => server.listen(0, "127.0.0.1", () => ok(server.address().port)));
const close = server => new Promise(ok => server.close(ok));
try {
  const apiPort = await listen(api), probe = createServer(), port = await listen(probe); await close(probe);
  app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "-p", String(port)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GXWEBMAIL_BUILD_DIR: ".next-admin-webpack-validation", TASTEMAIL_API_URL: `http://127.0.0.1:${apiPort}` } });
  for (const stream of [app.stdout, app.stderr]) stream.on("data", chunk => { childDiagnostic = (childDiagnostic + String(chunk)).slice(-3000); });
  const origin = `http://localhost:${port}`; let ready = false, lastStatus = null;
  for (let attempt = 0; attempt < 300; attempt++) { assert.equal(app.exitCode, null, childDiagnostic); try { lastStatus = (await fetch(`${origin}/ko/login`, { signal: AbortSignal.timeout(5000) })).status; if (lastStatus === 200) { ready = true; break; } } catch {} await delay(100); }
  assert.ok(ready, `fixture readiness status=${lastStatus}; ${childDiagnostic}`); console.log(`BROWSER_FIXTURE ${origin}/ko/login (synthetic-only)`);
  await new Promise(ok => { process.stdin.once("data", ok); process.stdin.once("end", ok); process.once("SIGTERM", ok); });
  assert.deepEqual({ ...counters, recover: undefined }, { queueAll: 1, resumePartial: 1, pause: 1, resume: 1, recover: undefined });
  assert.ok(counters.recover >= 1); assert.equal(userPaused, false); assert.equal(controlRevision, 3); assert.equal(inputs.length, 4);
  completed = true; await checkpoint("assertionsPassed");
  console.log(`Synthetic operation counters ${JSON.stringify(counters)}; remote transport absent`);
} finally {
  if (app?.exitCode === null) { const exited = new Promise(ok => app.once("exit", ok)); app.kill(); await exited; }
  api.closeAllConnections(); await close(api);
  await checkpoint(completed ? "cleanupComplete" : "incomplete");
}
console.log("Fixture cleanup complete");
