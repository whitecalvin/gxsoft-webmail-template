import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const cleanupCheck = process.argv.includes("--cleanup-check");
const viewOnly = process.argv.includes("--view-only");
assert.ok(cleanupCheck || process.stdin.isTTY, "Browser fixture requires tty=true");
const id = "11111111-1111-4111-8111-111111111111", ownerId = "22222222-2222-4222-8222-222222222222", mail = "urn:ietf:params:jmap:mail";
let writes = 0, app;
const api = createServer(async (req, res) => {
  const send = (body, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.url === "/api/auth/session" && req.method === "POST") {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const login = JSON.parse(raw);
    return login.username === "fixture@example.test" && login.password === "synthetic-only" ? send({ accessToken: "fixture-only", expiresAt: new Date(Date.now() + 600000).toISOString() }) : send({}, 401);
  }
  if (req.headers.authorization !== "Bearer fixture-only") return send({}, 401);
  if (req.url === "/.well-known/jmap") return send({ apiUrl: "/jmap/api", username: "fixture@example.test", primaryAccounts: { [mail]: ownerId }, accounts: { [ownerId]: { name: "Fixture", isPersonal: true, accountCapabilities: { [mail]: {} } } } });
  if (req.url === "/api/user/linked-accounts") return send({ accounts: [{ id, provider: "gmail", email: "synthetic@gmail.com", revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } }], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } });
  if (req.url === `/api/user/linked-accounts/${id}/sync/all` && req.method === "POST") {
    let raw = ""; for await (const chunk of req) raw += chunk;
    assert.deepEqual(JSON.parse(raw), { expectedRevision: 2 }); writes++;
    return send({ type: "partialQueue", queuedFolders: ["INBOX", "A&-B"], retryable: true, detail: "Synthetic partial only" }, 409);
  }
  if (req.url === `/api/user/linked-accounts/${id}/sync/jobs` && req.method === "GET") return send({ jobs: [] });
  if (req.url === "/jmap/api" && req.method === "POST") {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    return send({ methodResponses: request.methodCalls.map(([name, , tag]) => [name, name === "Mailbox/get" ? { accountId: ownerId, list: [] } : { accountId: ownerId, ids: [], position: 0, total: 0 }, tag]) });
  }
  return send({}, 404);
});
const listen = server => new Promise(ok => server.listen(0, "127.0.0.1", () => ok(server.address().port)));
const close = server => new Promise(ok => server.close(ok));
try {
  const apiPort = await listen(api), probe = createServer(), port = await listen(probe); await close(probe);
  app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "-p", String(port)], { stdio: ["ignore", "ignore", "ignore"], env: { ...process.env, GXWEBMAIL_BUILD_DIR: ".next-admin-turbo-recovery", TASTEMAIL_API_URL: `http://127.0.0.1:${apiPort}` } });
  const origin = `http://localhost:${port}`; let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) { assert.equal(app.exitCode, null); try { if ((await fetch(`${origin}/ko/login`)).status === 200) { ready = true; break; } } catch {} await delay(100); }
  assert.ok(ready);
  if (cleanupCheck) assert.equal(writes, 0, "cleanup check must not submit any operation");
  else {
    console.log(`BROWSER_FIXTURE ${origin}/ko/login (synthetic-only)`);
    await new Promise(ok => process.stdin.once("data", ok));
    assert.equal(writes, viewOnly ? 0 : 1, "view-only must not schedule; partial schedule must not retry"); console.log(viewOnly ? "View-only: zero operation POSTs" : "Synthetic all-folder partial: one POST confirmed");
  }
} finally {
  if (app?.exitCode === null) { const exited = new Promise(ok => app.once("exit", ok)); app.kill(); await exited; }
  api.closeAllConnections();
  await close(api);
}
console.log("Fixture cleanup complete");
