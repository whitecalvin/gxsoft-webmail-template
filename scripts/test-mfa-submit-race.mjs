import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { activationReceipt, enrollmentReceipt } from "../lib/tastemail/mfa-contract.ts";
const source = ts.createSourceFile("LiveMfaEnrollment.tsx", readFileSync(new URL("../components/settings/LiveMfaEnrollment.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submit;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "submit") submit = node;
  ts.forEachChild(node, visit);
}
visit(source); assert.ok(submit);
const handlerJs = ts.transpileModule(submit.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const enrollment = { enrollmentId: "11111111-1111-4111-8111-111111111111", secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", expiresAt: new Date(Date.now() + 600_000).toISOString() };
const receipt = { recoveryCodes: ["ABCD-EFGH-2345"], sessionsRevoked: 1 };
function fixture(overrides = {}) {
  const state = { calls: [], errors: [], uncertain: false, receipt: null, enrollment: null, refreshes: 0, password: "synthetic-only", code: "123456", busy: false };
  let resolve, reject;
  const pending = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  const lock = { current: false }, uncertainRef = { current: false }, mounted = { current: true };
  const bindings = {
    lock, uncertainRef, mounted, enabled: false, uncertain: false, expired: false, enrollment: null, password: state.password, code: state.code,
    AbortSignal, enrollmentReceipt, activationReceipt, t: key => key, service: key => key,
    setBusy: value => { state.busy = value; }, setError: value => state.errors.push(value),
    setPassword: value => { state.password = value; }, setCode: value => { state.code = value; },
    setUncertain: value => { state.uncertain = value; }, setExpired() {},
    setEnrollment: value => { state.enrollment = value; }, setReceipt: value => { state.receipt = value; },
    onChanged: () => { state.refreshes++; }, fetch: (url, init) => { state.calls.push({ url, body: JSON.parse(init.body) }); return pending; }, ...overrides,
  };
  const fn = new Function(...Object.keys(bindings), `${handlerJs}; return submit;`)(...Object.values(bindings));
  return { state, resolve, reject, lock, mounted, uncertainRef, submit: () => fn({ preventDefault() {} }) };
}
test("pending registration locks an immediate duplicate and clears password before fetch completes", async () => {
  const f = fixture(); const first = f.submit(); await f.submit();
  assert.equal(f.state.calls.length, 1); assert.equal(f.lock.current, true); assert.equal(f.state.password, "");
  f.resolve(Response.json(enrollment)); await first;
  assert.deepEqual(f.state.enrollment, enrollment); assert.equal(f.state.receipt, null); assert.equal(f.state.busy, false);
});
test("activation accepts only validated recovery codes and refreshes security without losing the receipt", async () => {
  const f = fixture({ enrollment }); const first = f.submit(); await f.submit();
  assert.equal(f.state.calls.length, 1); assert.equal(f.state.calls[0].body.enrollmentId, enrollment.enrollmentId);
  f.resolve(Response.json(receipt)); await first;
  assert.deepEqual(f.state.receipt, receipt); assert.equal(f.state.enrollment, null); assert.equal(f.state.refreshes, 1); assert.equal(f.state.code, "");
});
test("unknown activation outcome blocks stale callbacks before a React rerender", async () => {
  for (const response of [Response.json({}, { status: 503 }), Response.json({}), null]) {
    const f = fixture({ enrollment }); const first = f.submit();
    if (response) f.resolve(response); else f.reject(new Error("synthetic network loss"));
    await first; await f.submit();
    assert.equal(f.state.uncertain, true); assert.equal(f.state.calls.length, 1, "Unknown outcome must not resubmit before state commit");
    assert.equal(f.state.receipt, null); assert.equal(f.state.errors.at(-1), "uncertain");
  }
});
test("invalid code and session expiry are displayed separately, with no silent retry", async () => {
  for (const [http, status] of [[400, "invalidCode"], [401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"]]) {
    const f = fixture({ enrollment }); const first = f.submit(); f.resolve(Response.json({ status }, { status: http })); await first;
    assert.equal(f.state.calls.length, 1); assert.equal(f.state.errors.at(-1), status); assert.equal(f.state.uncertain, false); assert.equal(f.state.receipt, null);
  }
});
test("expired/enabled registrations cannot submit and unmounted forms discard responses", async () => {
  for (const overrides of [{ expired: true }, { enabled: true }, { uncertain: true }]) {
    const f = fixture(overrides); await f.submit(); assert.equal(f.state.calls.length, 0);
  }
  const f = fixture(); const first = f.submit(); f.mounted.current = false; f.resolve(Response.json(enrollment)); await first;
  assert.equal(f.state.enrollment, null); assert.equal(f.state.receipt, null); assert.equal(f.state.refreshes, 0);
});
