#!/usr/bin/env node
// Compiled Next.js BFF verification: synthetic loopback data only, no real account.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildId = (await readFile(resolve(root, ".next/BUILD_ID"), "utf8")).trim();
const token = "synthetic-theme-session", userId = "11111111-1111-4111-8111-111111111111";
const builtInThemeIds = ["base", "broadsheet", "industry", "modernist", "classical", "nocturne", "organic"].map(id => `tastemail-${id}`);
const pack = version => ({ themeId: "fixture-theme", themeVersion: version, manifest: { schemaVersion: 1, themeApi: "1.0", id: "fixture-theme", name: "Fixture Theme", version, extends: "tastemail-base", entry: "theme.css", colorModes: ["dark"], densities: ["dense"], preview: "assets/preview.webp", integrity: { algorithm: "sha256", files: {} } } });
let settings = null, receiptMode = "normal", failureStatus = 0, badCatalog = false, patches = 0, calls = 0, upstreamFailure;
const inherited = { theme: { id: "tastemail-base", version: null }, density: "comfortable", colorMode: "light", source: "domain", userSelectionAllowed: true };
const api = createServer(async (request, response) => {
  const json = (status, value) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
  try {
    calls++;
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    if (failureStatus) return json(failureStatus, { privateDetail: "must-not-forward" });
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (path === "/api/themes/catalog") return json(200, { builtInThemeIds, packages: badCatalog ? [{ ...pack("1.0.0"), manifest: { ...pack("1.0.0").manifest, id: "mismatch" } }] : [pack("1.0.0"), pack("2.0.0")] });
    if (path === "/api/themes/resolved") return json(200, settings ? { ...inherited, theme: settings.theme, density: settings.density, colorMode: settings.colorMode, source: "user" } : inherited);
    if (path === "/api/user/theme" && request.method === "GET") return json(200, settings);
    if (path === "/api/user/theme" && request.method === "PATCH") {
      let text = ""; for await (const chunk of request) text += chunk;
      const input = JSON.parse(text); patches++;
      assert.equal(input.action, "activate");
      if (input.expectedRevision !== (settings?.revision ?? 0)) return json(409, {});
      settings = { userId, theme: { id: input.themeId, version: input.themeVersion }, density: input.density, colorMode: input.colorMode, revision: input.expectedRevision + 1, updatedAt: "2026-10-02T00:00:00Z", privateDetail: "must-not-project" };
      return json(200, receiptMode === "mismatch" ? { ...settings, theme: { ...settings.theme, version: "9.0.0" } } : settings);
    }
    if (path === "/api/user/theme" && request.method === "DELETE") {
      const revision = Number(new URL(request.url, "http://127.0.0.1").searchParams.get("expectedRevision"));
      if (revision !== settings?.revision) return json(409, {});
      settings = null; response.writeHead(204); return response.end();
    }
    if (path.endsWith("/theme.css")) { response.writeHead(200, { "content-type": "text/css", "set-cookie": "must-not-forward" }); return response.end(':root{--tm-font-body:"Fixture Font",sans-serif}'); }
    throw new Error("Unexpected synthetic API path");
  } catch (error) { upstreamFailure = error; json(500, {}); }
});
async function listen(server) {
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const port = server.address().port;
  assert.ok(![3000, 7531, 7540].includes(port));
  return port;
}
async function freePort() { const server = createServer(); const port = await listen(server); await new Promise(done => server.close(done)); return port; }
let app;
try {
  const apiPort = await listen(api), webPort = await freePort(), origin = `http://127.0.0.1:${webPort}`;
  app = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "-p", String(webPort)], { cwd: root, windowsHide: true, stdio: "ignore", env: { ...process.env, GXWEBMAIL_DATA_MODE: "live", TASTEMAIL_API_URL: `http://127.0.0.1:${apiPort}` } });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (app.exitCode !== null) throw new Error("Synthetic Next.js server exited before readiness");
    try { if ((await fetch(`${origin}/api/mail/theme`, { signal: AbortSignal.timeout(1000) })).status === 401) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready); assert.equal(calls, 0, "anonymous reads must not contact upstream");
  const headers = { origin, cookie: `gxwebmail_tastemail_session=${token}`, "content-type": "application/json" };
  const request = (method = "GET", body, extra = {}, path = "/api/mail/theme") => fetch(`${origin}${path}`, { method, headers: { ...headers, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
  const initial = await request(); assert.equal(initial.status, 200); assert.equal(initial.headers.get("cache-control"), "no-store");
  const snapshot = await initial.json(); assert.equal(snapshot.settings, null); assert.equal(snapshot.catalog.packages.length, 2); assert.equal(snapshot.catalog.packages[1].themeVersion, "2.0.0"); assert.equal(snapshot.catalog.packages[0].manifest, undefined);
  const update = { expectedRevision: 0, themeId: "fixture-theme", themeVersion: "1.0.0", density: "dense", colorMode: "dark", action: "activate" };
  const before = calls;
  for (const [extra, body, status] of [[{ origin: "https://other.example.test" }, update, 403], [{ cookie: "" }, update, 401], [{}, { ...update, extra: true }, 400]]) assert.equal((await request("PATCH", body, extra)).status, status);
  assert.equal(calls, before);
  for (const change of [{ themeVersion: "3.0.0" }, { density: "comfortable" }, { colorMode: "light" }]) assert.equal((await request("PATCH", { ...update, ...change })).status, 400);
  assert.equal(patches, 0);
  const saved = await request("PATCH", update); assert.equal(saved.status, 200); const receipt = await saved.json(); assert.equal(receipt.revision, 1); assert.equal(receipt.theme.version, "1.0.0"); assert.equal(receipt.privateDetail, undefined);
  assert.equal((await request("PATCH", update)).status, 409);
  const asset = await request("GET", undefined, {}, "/api/mail/theme-assets/current/fixture-theme/1.0.0/theme.css"); assert.equal(asset.status, 200); assert.equal(asset.headers.get("set-cookie"), null); assert.ok((await asset.text()).includes("--tm-font-body"));
  assert.equal((await request("GET", undefined, {}, "/api/mail/theme-assets/current/fixture-theme/2.0.0/theme.css")).status, 409);
  receiptMode = "mismatch";
  assert.equal((await request("PATCH", { ...update, expectedRevision: 1, themeVersion: "2.0.0" })).status, 502);
  receiptMode = "normal";
  assert.equal((await (await request()).json()).settings.revision, 2, "uncertain acknowledgement needs readback, not automatic resend");
  const reset = await request("DELETE", { expectedRevision: 2 }); assert.equal(reset.status, 200); const inheritedSnapshot = await reset.json(); assert.equal(inheritedSnapshot.settings, null); assert.equal(inheritedSnapshot.resolved.source, "domain");
  badCatalog = true; assert.equal((await request()).status, 502); badCatalog = false;
  for (const [upstream, expected] of [[401, 401], [403, 403], [429, 429], [503, 503]]) {
    failureStatus = upstream; const response = await request(); assert.equal(response.status, expected); assert.equal((await response.json()).privateDetail, undefined);
  }
  failureStatus = 0;
  assert.equal((await request()).status, 200, "read must recover after synthetic API restoration");
  if (upstreamFailure) throw upstreamFailure;
  assert.equal((await readFile(resolve(root, ".next/BUILD_ID"), "utf8")).trim(), buildId);
  console.log(`Compiled theme catalog/save/reset/assets/error contracts passed (BUILD_ID ${buildId}); synthetic loopback only`);
} finally {
  if (app && app.exitCode === null) { app.kill(); await Promise.race([new Promise(done => app.once("exit", done)), delay(2000)]); }
  api.closeAllConnections(); await new Promise(done => api.close(done));
}
