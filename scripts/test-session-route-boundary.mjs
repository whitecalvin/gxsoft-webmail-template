// Execute the real route with real NextResponse cookies and synthetic upstreams only.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "exports", "module", compiled)(name => {
    if (name.startsWith(".")) {
      const relative = new URL(`${name}.ts`, new URL(path, import.meta.url));
      if (!Object.hasOwn(dependencies, name) && existsSync(relative)) return load(relative.href);
    }
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
    return dependencies[name];
  }, compiledModule.exports, compiledModule);
  return compiledModule.exports;
}
const server = load("../lib/tastemail/server.ts", { "server-only": {} });
const contract = load("../lib/tastemail/session-contract.ts", { "server-only": {} });
const loginBody = load("../lib/tastemail/login-body.ts", { "server-only": {} });
const sessionSource = readFileSync(new URL("../lib/tastemail/session.ts", import.meta.url), "utf8");
const cookieName = sessionSource.match(/TASTEMAIL_SESSION_COOKIE_NAME = "([^"]+)"/u)?.[1];
assert.ok(cookieName, "Use the current application cookie name");
let token;
let configured = true;
let reply;
const calls = [];
const route = load("../app/api/mail/session/route.ts", {
  "next/server": require("next/server"),
  "@/lib/tastemail/server": { ...server,
    assertLiveApiConfigured: () => { if (!configured) throw new server.ApiConfigurationError("synthetic configuration failure"); },
    tastemailRequest: async (...args) => { calls.push(args); if (reply instanceof Error) throw reply; return reply; },
  },
  "@/lib/tastemail/session": { TASTEMAIL_SESSION_COOKIE_NAME: cookieName, tastemailSessionToken: async () => token },
  "@/lib/tastemail/session-contract": contract,
  "@/lib/tastemail/login-body": loginBody,
});
function reset() { token = undefined; configured = true; reply = undefined; calls.length = 0; }
const credentials = { username: "synthetic@example.test", password: "synthetic-password" };
function request(method = "POST", origin = "http://127.0.0.1:7540", body = credentials, extra = {}) {
  return new Request(`${origin}/api/mail/session`, { method, headers: { origin, ...extra },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
}
async function check(response, code, expected) {
  assert.equal(response.status, code);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), expected);
  return response;
}
const cookieAbsent = response => assert.equal(response.headers.get("set-cookie"), null);

for (const headers of [{ origin: "https://other.example.test" }, { origin: "null" }]) {
  reset(); cookieAbsent(await check(await route.POST(request("POST", undefined, credentials, headers)), 403, { status: "forbidden" }));
  assert.equal(calls.length, 0);
}
reset();
await check(await route.POST(new Request("http://127.0.0.1:7540/api/mail/session", { method: "POST", body: JSON.stringify(credentials) })), 403, { status: "forbidden" });
assert.equal(calls.length, 0);
reset(); await check(await route.POST(request("POST", "http://192.168.0.109:7540")), 403, { status: "insecure_transport" }); assert.equal(calls.length, 0);
reset(); configured = false;
await check(await route.POST(request()), 503, { status: "configuration_error" });
await check(await route.GET(), 503, { mode: "live", status: "configuration_error" }); assert.equal(calls.length, 0);
for (const body of ["{", "x".repeat(4097), null, {}, { ...credentials, password: "" }, { ...credentials, mfaCode: 123 }]) {
  reset(); await check(await route.POST(request("POST", undefined, body)), 400, { status: "invalid_request" }); assert.equal(calls.length, 0);
}
const encoder = new TextEncoder();
function streamedRequest(stream, signal) {
  return new Request("http://127.0.0.1:7540/api/mail/session", {
    method: "POST", headers: { origin: "http://127.0.0.1:7540" }, body: stream, duplex: "half", signal,
  });
}
// Preserve the existing 4096 UTF-16-unit boundary, not a 4096-byte ASCII-only limit.
for (const character of ["a", "한", "😀"]) {
  const padding = character.repeat(Math.floor(4094 / character.length));
  const raw = JSON.stringify(padding);
  const octets = encoder.encode(raw);
  const stream = new ReadableStream({ start(controller) {
    // Split multibyte sequences to exercise streaming UTF-8 decoding.
    for (let index = 0; index < octets.length; index += 7) controller.enqueue(octets.slice(index, index + 7));
    controller.close();
  } });
  assert.equal(await loginBody.readLoginBody(streamedRequest(stream)), padding);
  assert.equal(stream.locked, false);
}
for (const octets of [encoder.encode("x".repeat(16 * 1024 + 1)), new Uint8Array([0xff])]) {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(octets); }, cancel() { cancelled = true; } });
  reset(); cookieAbsent(await check(await route.POST(streamedRequest(stream)), 400, { status: "invalid_request" }));
  assert.equal(calls.length, 0); assert.equal(cancelled, true); assert.equal(stream.locked, false);
}
{
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  reset(); const result = route.POST(streamedRequest(stream, controller.signal));
  controller.abort();
  await check(await result, 400, { status: "invalid_request" });
  assert.equal(calls.length, 0); assert.equal(cancelled, true); assert.equal(stream.locked, false);
}
{
  const controller = new AbortController(); controller.abort();
  reset(); await check(await route.POST(new Request("http://127.0.0.1:7540/api/mail/session", {
    method: "POST", headers: { origin: "http://127.0.0.1:7540" }, body: JSON.stringify(credentials), signal: controller.signal,
  })), 400, { status: "invalid_request" });
  assert.equal(calls.length, 0);
}
await assert.rejects(loginBody.readLoginBody(streamedRequest(new ReadableStream({ start(controller) {
  controller.enqueue(new Uint8Array([0xe3, 0x81])); controller.close();
} }))));
{
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } });
  const started = Date.now();
  reset(); await check(await route.POST(streamedRequest(stream)), 400, { status: "invalid_request" });
  assert.ok(Date.now() - started >= 4900, "Exercise the real five-second whole-body deadline");
  assert.ok(Date.now() - started < 10000, "Unfinished stream cancellation must not delay the response");
  assert.equal(calls.length, 0); assert.equal(cancelled, true); assert.equal(stream.locked, false);
}
for (const [upstream, type, code, status] of [
  [401, "mfaRequired", 401, "mfaRequired"], [401, "invalidMfaCode", 401, "invalidMfaCode"],
  [401, "unknown", 401, "unauthorized"], [403, "mfaRequired", 403, "forbidden"],
  [429, "invalidMfaCode", 429, "rateLimited"], [500, "unknown", 503, "retryable"], [400, "unknown", 502, "unavailable"],
]) {
  reset(); reply = Response.json({ type, secret: "synthetic-private-value" }, { status: upstream });
  cookieAbsent(await check(await route.POST(request()), code, { status }));
  assert.equal(calls[0][0], "/api/auth/session"); assert.equal(calls[0][1], undefined);
}
for (const payload of [null, {}, { accessToken: "synthetic-token", expiresAt: "invalid" },
  { accessToken: "", expiresAt: "2099-01-01T00:00:00Z" }, { accessToken: "synthetic-token", expiresAt: "2000-01-01T00:00:00Z" }]) {
  reset(); reply = Response.json(payload); cookieAbsent(await check(await route.POST(request()), 502, { status: "unavailable" }));
}
reset(); reply = new Error("synthetic network failure");
cookieAbsent(await check(await route.POST(request()), 503, { status: "retryable" }));
reset(); reply = Response.json({ accessToken: "synthetic-token", expiresAt: "2099-01-01T00:00:00Z", privateField: "synthetic" });
const signedIn = await check(await route.POST(request("POST", "https://webmail.example.test", { ...credentials, mfaCode: "123456" })), 200, { status: "authenticated" });
const cookie = signedIn.headers.get("set-cookie");
for (const part of ["HttpOnly", "Secure", "SameSite=strict", "Path=/", "Expires="]) assert.ok(cookie.includes(part));
assert.deepEqual(JSON.parse(calls[0][2].body), { ...credentials, mfaCode: "123456" });

reset(); await check(await route.GET(), 401, { mode: "live", authenticated: false }); assert.equal(calls.length, 0);
for (const [upstream, code, status] of [[401, 401, "unauthorized"], [403, 403, "forbidden"], [429, 429, "rateLimited"], [500, 503, "retryable"], [400, 502, "unavailable"]]) {
  reset(); token = "synthetic-token"; reply = new Response(null, { status: upstream });
  const response = await check(await route.GET(), code, { mode: "live", authenticated: false, status });
  assert.equal(response.headers.has("set-cookie"), upstream === 401, "Only expiry may remove the existing cookie");
  assert.deepEqual(calls[0], ["/.well-known/jmap", token]);
}
for (const payload of [null, {}, { username: "synthetic", apiUrl: "https://other.example.test/jmap/api", primaryAccounts: {} }]) {
  reset(); token = "synthetic-token"; reply = Response.json(payload);
  cookieAbsent(await check(await route.GET(), 502, { mode: "live", authenticated: false, status: "unavailable" }));
}
reset(); token = "synthetic-token"; reply = new Error("synthetic timeout");
cookieAbsent(await check(await route.GET(), 503, { mode: "live", authenticated: false, status: "retryable" }));
reset(); token = "synthetic-token";
reply = Response.json({ username: credentials.username, apiUrl: "/jmap/api", primaryAccounts: { [contract.MAIL_CAPABILITY]: "synthetic-account" }, accounts: { "synthetic-account": {} }, accessToken: token });
cookieAbsent(await check(await route.GET(), 200, { mode: "live", authenticated: true, username: credentials.username, accountId: "synthetic-account" }));

for (const upstream of [204, 401, 403, 500, "network", "configuration", "no-token"]) {
  reset(); token = upstream === "no-token" ? undefined : "synthetic-token";
  configured = upstream !== "configuration";
  reply = upstream === "network" ? new Error("synthetic") : new Response(null, { status: typeof upstream === "number" ? upstream : 500 });
  const revoked = [204, 401, "no-token"].includes(upstream);
  const response = await check(await route.DELETE(request("DELETE")), revoked ? 200 : 503, { status: revoked ? "signed_out" : "signout_unconfirmed" });
  assert.ok(response.headers.get("set-cookie").includes("Expires=Thu, 01 Jan 1970"));
  assert.equal(calls.length, ["configuration", "no-token"].includes(upstream) ? 0 : 1);
}
reset(); token = "synthetic-token";
cookieAbsent(await check(await route.DELETE(request("DELETE", undefined, undefined, { origin: "https://other.example.test" })), 403, { status: "forbidden" })); assert.equal(calls.length, 0);
console.log("Session route boundary passed: bounded UTF-8 streaming, whole-body deadline/cancellation, origin/transport guards, MFA, real NextResponse cookie flags, expiry, permission/rate/error mapping, redaction and uncertain signout. Synthetic upstreams only; no network.");
