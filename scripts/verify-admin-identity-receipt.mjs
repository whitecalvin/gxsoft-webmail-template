#!/usr/bin/env node
// Compiled BFF verification on synthetic loopback ports; never uses real accounts.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildId = (await readFile(resolve(root, ".next/BUILD_ID"), "utf8")).trim();
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const token = "synthetic-admin-identity-token";
const cookieName = "gxwebmail_tastemail_session";
let outcome = { status: 200, body: { id, currentSessionRevoked: false } };
let received = 0;
let expectedPath = "";
let expectedMethod = "";
let upstreamFailure;
const api = createServer(async (request, response) => {
  try {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    assert.equal(request.url, expectedPath);
    assert.equal(request.method, expectedMethod);
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    assert.ok(input.address === "qa@example.test" || input.password === "synthetic-password" || input.name === "example.test");
    received += 1;
    response.writeHead(outcome.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(outcome.body));
  } catch (error) {
    upstreamFailure = error;
    response.writeHead(500).end();
  }
});
async function listen(server) {
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  return server.address().port;
}
async function freePort() {
  const temporary = createServer();
  const port = await listen(temporary);
  await new Promise(done => temporary.close(done));
  assert.ok(![3000, 7531, 7540].includes(port), "reserved user ports must not be used");
  return port;
}
let app;
try {
  const apiPort = await listen(api), webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  app = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "-p", String(webPort)], {
    cwd: root, windowsHide: true, stdio: "ignore",
    env: { ...process.env, GXWEBMAIL_DATA_MODE: "live", TASTEMAIL_API_URL: `http://127.0.0.1:${apiPort}` },
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (app.exitCode !== null) throw new Error("Synthetic Next.js server exited before readiness");
    try { if ((await fetch(`${origin}/api/mail/session`, { signal: AbortSignal.timeout(1000) })).status === 401) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, "synthetic Next.js server readiness");
  let checked = 0;
  async function submit(action, headers = {}) {
    return fetch(`${origin}/api/mail/admin/manage`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", origin, cookie: `${cookieName}=${token}`, ...headers },
      body: JSON.stringify({ resource: action === "create" ? "domains" : "users", action, ...(action === "create" ? {} : { id }), confirmed: true,
        input: action === "create" ? { name: "example.test" } : action === "address" ? { address: "qa@example.test" } : { password: "synthetic-password" } }),
    });
  }
  for (const action of ["address", "password"]) {
    expectedPath = `/api/admin/users/${id}/${action}`;
    expectedMethod = action === "address" ? "PATCH" : "POST";
    for (const revoked of [false, true]) {
      outcome = { status: 200, body: { id, currentSessionRevoked: revoked, passwordHash: "must-not-project" } };
      const response = await submit(action);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "updated", currentSessionRevoked: revoked });
      const cookie = response.headers.get("set-cookie");
      if (revoked) { assert.ok(cookie?.startsWith(`${cookieName}=`)); assert.ok(cookie.includes("Max-Age=0") || cookie.includes("1970")); }
      else assert.equal(cookie, null);
      checked += 1;
    }
    for (const body of [{ id }, { id, currentSessionRevoked: null }, { id, currentSessionRevoked: "true" }, { id, currentSessionRevoked: 1 }, { id: other, currentSessionRevoked: true }]) {
      outcome = { status: 200, body };
      const response = await submit(action);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { status: "mutationUncertain" });
      assert.equal(response.headers.get("set-cookie"), null);
      checked += 1;
    }
  }
  expectedPath = "/api/admin/domains"; expectedMethod = "POST";
  outcome = { status: 201, body: { id, currentSessionRevoked: true } };
  const unrelated = await submit("create");
  assert.deepEqual(await unrelated.json(), { status: "updated", currentSessionRevoked: false });
  assert.equal(unrelated.headers.get("set-cookie"), null);
  checked += 1;
  const before = received;
  assert.equal((await submit("create", { origin: "https://other.example.test" })).status, 403);
  assert.equal((await submit("create", { cookie: "" })).status, 401);
  assert.equal(received, before, "rejected requests must not reach the upstream");
  checked += 2;
  if (upstreamFailure) throw upstreamFailure;
  assert.equal((await readFile(resolve(root, ".next/BUILD_ID"), "utf8")).trim(), buildId, "compiled input must remain stable");
  console.log(`Compiled administrator identity receipt: ${checked} checks passed (BUILD_ID ${buildId})`);
} finally {
  if (app && app.exitCode === null) { app.kill(); await Promise.race([new Promise(done => app.once("exit", done)), delay(2000)]); }
  api.closeAllConnections();
  await new Promise(done => api.close(done));
}
