import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as catalog from "../lib/mailbox-icon-catalog.mjs";
function load(path, imports) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  }, TextDecoder, Set, URL, Number, Response }, { filename: path });
  return loaded.exports;
}
const next = { NextResponse: { json: (value, init) => Response.json(value, init) } };
const origin = load("lib/tastemail/contact-route.ts", { "server-only": {}, "next/server": next, "./contacts": {}, "./mail": {} });
const contract = load("lib/tastemail/icon-preferences-contract.ts", { "../mailbox-icon-catalog.mjs": catalog });
class ServiceError extends Error { constructor(status) { super(status); this.status = status; } }
let token = "synthetic-session", config = true, sessionFailure = false, upstreamError, ownerAccount = "owner@example.test";
const calls = [];
const result = { revision: 1, preferences: [] };
const service = operation => async (...args) => { calls.push([operation, ...args]); if (upstreamError) throw upstreamError; return result; };
const route = load("lib/tastemail/icon-preferences-route.ts", {
  "server-only": {}, "next/server": next, "./contact-route": origin, "./icon-preferences-contract": contract,
  "./server": { assertLiveApiConfigured: () => { if (!config) throw new Error(); } },
  "./session": { tastemailSessionToken: async () => { if (sessionFailure) throw new Error("private failure"); return token; } },
  "./icon-preferences": { IconPreferencesServiceError: ServiceError, loadLiveIconAccount: async () => ownerAccount, loadLiveIconPreferences: service("read"), updateLiveIconPreferences: service("write"), resetLiveIconPreferences: service("reset") },
});
const body = { revision: 0, changes: [{ target: { type: "profile" }, icon: "lucide:mail" }] };
const request = (payload = body, headers = {}) => new Request("https://webmail.example.test/api/mail/icon-preferences", {
  method: "PATCH", headers: { origin: "https://webmail.example.test", "content-type": "application/json", "x-gxmail-icon-account": "owner@example.test", ...headers }, body: typeof payload === "string" ? payload : JSON.stringify(payload),
});
let response = await route.readIconPreferences(request());
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert.equal(JSON.stringify(await response.json()).includes(token), false);
response = await route.writeIconPreferences(request());
assert.equal(response.status, 200);
assert.equal(calls.at(-1)[0], "write");
assert.equal(calls.at(-1)[1], token);
assert.equal(calls.at(-1)[2], 0);
assert.equal(JSON.stringify(calls.at(-1)[3]), JSON.stringify(body.changes));
const beforeForeign = calls.length;
assert.equal((await route.writeIconPreferences(request(body, { "x-gxmail-icon-account": "foreign@example.test" }))).status, 403);
assert.equal((await route.writeIconPreferences(request({ revision: 0, scope: { type: "all" } }, { "x-gxmail-icon-account": "foreign@example.test" }), true)).status, 403);
assert.equal((await route.readIconPreferences(request(body, { "x-gxmail-icon-account": "foreign@example.test" }))).status, 403);
ownerAccount = "other@example.test";
assert.equal((await route.writeIconPreferences(request())).status, 403);
ownerAccount = "owner@example.test";
const noOwner = request(); noOwner.headers.delete("x-gxmail-icon-account");
assert.equal((await route.writeIconPreferences(noOwner)).status, 400);
assert.equal(calls.length, beforeForeign, "foreign/stale owner cannot access or mutate icon snapshots");
for (const bad of [
  request(body, { origin: "https://other.example.test" }), request(body, { origin: "null" }), request(body, { origin: "http://webmail.example.test" }),
]) assert.equal((await route.writeIconPreferences(bad)).status, 403);
const missingOrigin = request(); missingOrigin.headers.delete("origin");
assert.equal((await route.writeIconPreferences(missingOrigin)).status, 403);
const beforeBad = calls.length;
for (const bad of [
  request("{"), request(body, { "content-type": "text/plain" }), request({ ...body, userId: "foreign" }),
  request({ ...body, changes: [] }), request({ ...body, revision: -1 }), request(" ".repeat(32769)),
  request(JSON.stringify(body) + " ".repeat(32768), { "content-length": "1" }),
  request(body, { "content-length": "32769" }), request({ revision: 0, scope: { type: "all" } }),
]) assert.equal((await route.writeIconPreferences(bad)).status, 400);
assert.equal(calls.length, beforeBad);
let cancelled = false;
const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32769)); }, cancel() { cancelled = true; } });
const oversized = new Request("https://webmail.example.test/api/mail/icon-preferences", { method: "PATCH", headers: { origin: "https://webmail.example.test", "content-type": "application/json" }, body: stream, duplex: "half" });
assert.equal((await route.writeIconPreferences(oversized)).status, 400);
assert.equal(cancelled, true);
response = await route.writeIconPreferences(request({ revision: 0, scope: { type: "target", target: { type: "profile" } } }), true);
assert.equal(response.status, 200); assert.equal(calls.at(-1)[0], "reset");
token = null;
assert.equal((await route.readIconPreferences(request())).status, 401);
assert.equal((await route.writeIconPreferences(request())).status, 401);
config = false;
assert.equal((await route.readIconPreferences(request())).status, 503);
config = true; token = "synthetic-session"; sessionFailure = true;
assert.equal((await route.readIconPreferences(request())).status, 503);
sessionFailure = false;
for (const [status, code] of [["unauthorized", 401], ["forbidden", 403], ["invalid_request", 400], ["conflict", 409], ["rateLimited", 429], ["retryable", 503], ["unavailable", 502]]) {
  upstreamError = new ServiceError(status);
  response = await route.writeIconPreferences(request());
  assert.equal(response.status, code);
  assert.equal((await response.json()).status, status);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  if (code === 429) assert.equal(response.headers.get("retry-after"), "60");
}
const paths = ["app/api/mail/icon-preferences/route.ts", "app/api/mail/icon-preferences/reset/route.ts"];
for (const path of paths) {
  const wrapper = load(path, { "@/lib/tastemail/icon-preferences-route": route });
  assert.equal(wrapper.runtime, "nodejs");
  assert.equal(path.includes("/reset/") ? typeof wrapper.POST : typeof wrapper.PATCH, "function");
}
console.log("Icon BFF routes: HttpOnly-session forwarding, CSRF, byte limits/cancellation, strict input, reset, no-store and distinct failures passed (no network).");
