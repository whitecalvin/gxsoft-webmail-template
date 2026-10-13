// Executes the real adapter and route with synthetic server/session dependencies.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

class MailServiceError extends Error {
  constructor(status) { super(status); this.status = status; }
}
let mode = "live", configured = true, token = "synthetic-token";
let tokenReads = 0, requests = 0, httpStatus = 200, requestError = null;
const fixture = {
  id: "11111111-1111-4111-8111-111111111111", address: "shared@example.test",
  displayName: "Synthetic shared", usedBytes: 120, quotaBytes: 1024,
  rights: { mayRead: true, mayWrite: false, maySend: false, mayManage: false },
};
let payload = { items: [fixture] };
const statusFor = code => code === 401 ? "unauthorized" : code === 403 ? "forbidden" :
  code === 429 ? "rateLimited" : code >= 500 ? "retryable" : "unavailable";
function execute(path, dependencies) {
  const compiledModule = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("require", "exports", "module", compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  }, compiledModule.exports, compiledModule);
  return compiledModule.exports;
}
const adapter = execute("../lib/tastemail/shared-mailboxes.ts", {
  "server-only": {}, "./mail": { MailServiceError },
  "./server": { serviceStatus: statusFor, tastemailRequest: async (path, receivedToken) => {
    assert.equal(path, "/api/shared-mailboxes"); assert.equal(receivedToken, token);
    requests++;
    if (requestError) throw requestError;
    return Response.json(payload, { status: httpStatus });
  } },
});
const route = execute("../app/api/mail/shared-mailboxes/route.ts", {
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
  "@/lib/tastemail/mail": { MailServiceError },
  "@/lib/tastemail/shared-mailboxes": adapter,
  "@/lib/tastemail/server": { mailDataMode: () => mode,
    assertLiveApiConfigured: () => { if (!configured) throw new Error("fixture config"); } },
  "@/lib/tastemail/session": { tastemailSessionToken: async () => { tokenReads++; return token; } },
});
async function check(code, expected) {
  const response = await route.GET();
  assert.equal(response.status, code);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), expected);
}
mode = "live"; configured = false;
await check(503, { status: "configuration_error" });
assert.equal(tokenReads, 0); assert.equal(requests, 0);
configured = true; token = null;
await check(401, { status: "unauthorized" }); assert.equal(requests, 0);
token = "synthetic-token";
await check(200, { items: [fixture] });
payload = { items: [] }; await check(200, { items: [] });
for (const rights of [
  { mayRead: false, mayWrite: false, maySend: false, mayManage: false },
  { mayRead: true, mayWrite: true, maySend: true, mayManage: true },
]) {
  payload = { items: [{ ...fixture, rights }] };
  await check(200, payload); // Preserve server permissions; never infer missing grants.
}
for (const bad of [null, [], {}, { items: {} }, { items: Array(1001).fill(fixture) },
  ...[{ id: "" }, { address: "" }, { displayName: 1 }, { usedBytes: -1 },
    { usedBytes: 1.5 }, { quotaBytes: Number.MAX_SAFE_INTEGER + 1 },
    { rights: null }, { rights: { ...fixture.rights, maySend: "true" } },
    { rights: { mayRead: true } }].map(change => ({ items: [{ ...fixture, ...change }] })),
]) {
  payload = bad; await check(502, { status: "unavailable" });
}
payload = { items: [fixture] };
for (const code of [401, 403, 429, 500, 503]) {
  httpStatus = code;
  await check(code >= 500 ? 503 : code, { status: statusFor(code) });
}
httpStatus = 200; requestError = new Error("synthetic internal detail must not leak");
await check(503, { status: "retryable" });
console.log("Shared mailbox boundaries: real adapter/GET, mode/auth, rights, payload limits, errors and no-store passed.");
