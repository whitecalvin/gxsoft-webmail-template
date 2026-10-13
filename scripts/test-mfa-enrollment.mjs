import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../lib/tastemail/mfa-contract.ts";
const id = "11111111-1111-4111-8111-111111111111";
const secret = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const enrollment = { enrollmentId: id, secret, expiresAt: new Date(Date.now() + 600_000).toISOString() };
const receipt = { recoveryCodes: ["ABCD-EFGH-2345", "IJKL-MNOP-6789"], sessionsRevoked: 2 };
function transpile(path, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, Response, Request, URL, AbortSignal, TextEncoder,
    require(name) { if (name === "server-only") return {}; if (!(name in dependencies)) throw Error(name); return dependencies[name]; } });
  return exports;
}
const serviceStatus = code => code === 401 ? "unauthorized" : code === 403 ? "forbidden" : code === 429 ? "rateLimited" : code >= 500 ? "retryable" : "unavailable";
function adapter(response) {
  const calls = [];
  const api = transpile("../lib/tastemail/mfa.ts", { "./mfa-contract": contract, "./server": { serviceStatus,
    async tastemailRequest(path, token, init) { calls.push({ path, token, init }); return response; } } });
  return { ...api, calls };
}
test("strict Rust inputs retain password whitespace and reject cross-account fields", () => {
  assert.deepEqual(contract.mfaInput({ operation: "begin", currentPassword: " p " }), { operation: "begin", currentPassword: " p " });
  assert.deepEqual(contract.mfaInput({ operation: "activate", enrollmentId: id, code: " 123456 " }), { operation: "activate", enrollmentId: id, code: "123456" });
  for (const input of [null, {}, { operation: "disable" }, { operation: "begin", currentPassword: "" },
    { operation: "begin", currentPassword: "한".repeat(342) }, { operation: "begin", currentPassword: "p", accountId: id },
    { operation: "activate", enrollmentId: "wrong", code: "123456" }, { operation: "activate", enrollmentId: id, code: "12345a" }]) assert.equal(contract.mfaInput(input), null);
});
test("receipts are projected, expire, and reject invalid recovery-code acknowledgements", () => {
  assert.deepEqual(contract.enrollmentReceipt({ ...enrollment, token: "synthetic-only" }), enrollment);
  assert.deepEqual(contract.activationReceipt({ ...receipt, token: "synthetic-only" }), receipt);
  for (const value of [{}, { ...enrollment, expiresAt: "2000-01-01T00:00:00Z" }, { ...enrollment, secret: "bad" }]) assert.throws(() => contract.enrollmentReceipt(value));
  for (const value of [{}, { ...receipt, recoveryCodes: [] }, { ...receipt, recoveryCodes: ["ABCD-EFGH", "ABCD-EFGH"] }, { ...receipt, sessionsRevoked: -1 }]) assert.throws(() => contract.activationReceipt(value));
});
test("adapter uses exact server paths and never forwards operation/account IDs", async () => {
  for (const [input, payload, path] of [
    [{ operation: "begin", currentPassword: "synthetic-only" }, enrollment, "enrollments"],
    [{ operation: "activate", enrollmentId: id, code: "123456" }, receipt, "activate"],
  ]) {
    const api = adapter(Response.json(payload)); await api.changeLiveMfa("synthetic-token", input);
    assert.equal(api.calls.length, 1); assert.equal(api.calls[0].path, `/api/user/security/mfa/totp/${path}`);
    assert.equal(api.calls[0].token, "synthetic-token"); assert.equal(api.calls[0].init.method, "POST"); assert.ok(api.calls[0].init.signal);
    assert.equal("operation" in JSON.parse(api.calls[0].init.body), false);
  }
});
test("invalid MFA code is distinct from expired session; errors are not retried", async () => {
  for (const [http, payload, input, status] of [
    [401, { type: "invalidMfaCode" }, { operation: "activate", enrollmentId: id, code: "123456" }, "invalidCode"],
    [401, { type: "unauthorized" }, { operation: "activate", enrollmentId: id, code: "123456" }, "unauthorized"],
    [403, { type: "forbidden", detail: "current password is incorrect" }, { operation: "begin", currentPassword: "synthetic" }, "passwordRejected"],
    [403, { type: "forbidden" }, { operation: "begin", currentPassword: "synthetic" }, "forbidden"],
    [404, {}, { operation: "activate", enrollmentId: id, code: "123456" }, "expired"],
    [409, {}, { operation: "activate", enrollmentId: id, code: "123456" }, "conflict"],
    [429, {}, { operation: "begin", currentPassword: "synthetic" }, "rateLimited"],
    [503, {}, { operation: "begin", currentPassword: "synthetic" }, "retryable"],
  ]) { const api = adapter(Response.json(payload, { status: http })); await assert.rejects(() => api.changeLiveMfa("synthetic", input), { status }); assert.equal(api.calls.length, 1); }
});
test("BFF blocks CSRF, mock mode, unauthenticated calls, and unexpected fields", async () => {
  let mode = "live", token = "synthetic", writes = 0;
  const api = transpile("../app/api/mail/security/mfa/route.ts", {
    "next/server": { NextResponse: { json: Response.json } }, "@/lib/tastemail/mfa-contract": contract,
    "@/lib/tastemail/mfa": { MfaServiceError: class extends Error {}, async changeLiveMfa() { writes++; return enrollment; } },
    "@/lib/tastemail/server": { mailDataMode: () => mode, assertLiveApiConfigured() {} },
    "@/lib/tastemail/session": { async tastemailSessionToken() { return token; } },
  });
  const request = (body, origin = "https://mail.test.invalid") => new Request("https://mail.test.invalid/api/mail/security/mfa", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const input = { operation: "begin", currentPassword: "synthetic" };
  assert.equal((await api.POST(request(input, "https://evil.test.invalid"))).status, 403);
  mode = "live"; token = null; assert.equal((await api.POST(request(input))).status, 401);
  token = "synthetic"; assert.equal((await api.POST(request({ ...input, userId: id }))).status, 400); assert.equal(writes, 0);
  const result = await api.POST(request(input)); assert.equal(result.status, 200); assert.match(result.headers.get("cache-control"), /no-store/); assert.equal(writes, 1);
});
test("UI has memory-only secrets, synchronous mutation guard, no automatic retries", () => {
  const ui = readFileSync(new URL("../components/settings/LiveMfaEnrollment.tsx", import.meta.url), "utf8");
  assert.match(ui, /lock\.current = true/); assert.match(ui, /if \(lock\.current \|\| uncertainRef\.current/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|console\.|setInterval/);
  assert.match(ui, /setPassword\(""\)/); assert.match(ui, /setReceipt\(null\)/); assert.match(ui, /setEnrollment\(null\)/);
  assert.match(ui, /setUncertain\(true\)/); assert.match(ui, /activationReceipt\(payload\)/);
  const parent = readFileSync(new URL("../components/settings/LiveSecurity.tsx", import.meta.url), "utf8");
  assert.match(parent, /onChanged=\{\(\) => setRefreshRevision/);
});
