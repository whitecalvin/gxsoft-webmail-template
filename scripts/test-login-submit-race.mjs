import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { clientLoginFailure } from "../lib/tastemail/client-session-status.ts";

const source = ts.createSourceFile("LoginPageClient.tsx", readFileSync(new URL("../components/auth/LoginPageClient.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handlerNode;
const lockedInputs = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleSubmit") handlerNode = node.initializer;
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "input") {
    const attrs = node.attributes.properties;
    const id = attrs.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === "id")?.initializer?.text;
    if (["login-email", "login-password", "login-mfa-code"].includes(id)) {
      assert.equal(attrs.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === "disabled")?.initializer?.expression?.getText(source), "isSubmitting");
      lockedInputs.push(id);
    }
  }
  ts.forEachChild(node, visit);
}
visit(source); assert.ok(handlerNode); assert.equal(lockedInputs.length, 3);
const js = ts.transpileModule(`const handler = ${handlerNode.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture(overrides = {}) {
  const state = { requests: [], errors: [], busy: false, mfa: false, navigations: [], cleared: [], localWrites: [], timer: null };
  let resolve; let reject;
  const response = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  const submittingRef = { current: false };
  const bindings = {
    mode: "live", email: "synthetic@example.test", password: "fixture-only", mfaCode: "", mfaRequired: false,
    isSubmitting: false, submittingRef, locale: "ko", remember: true, AbortSignal, clientLoginFailure,
    setError: (value) => state.errors.push(value), setIsSubmitting: (value) => { state.busy = value; },
    setMfaRequired: (value) => { state.mfa = value; }, setPassword: (value) => state.cleared.push(["password", value]), setMfaCode: (value) => state.cleared.push(["mfaCode", value]),
    fetch: (url, options) => { state.requests.push({ url, body: JSON.parse(options.body) }); return response; },
    window: { location: { protocol: "http:", hostname: "127.0.0.1", replace: (url) => state.navigations.push(url) }, setTimeout: (fn) => { state.timer = fn; }, localStorage: { setItem: (...args) => state.localWrites.push(args) } },
    router: { push: (url) => state.navigations.push(url) }, ...overrides,
  };
  const handler = new Function(...Object.keys(bindings), `${js}; return handler;`)(...Object.values(bindings));
  return { state, submittingRef, resolve, reject, submit: () => handler({ preventDefault() {} }) };
}
const success = fixture(); const first = success.submit(); await success.submit();
assert.equal(success.state.requests.length, 1, "Immediate duplicate login blocked before rerender");
assert.equal(success.submittingRef.current, true);
success.resolve(Response.json({ status: "authenticated" })); await first;
assert.deepEqual(success.state.navigations, ["/ko"]); assert.equal(success.submittingRef.current, false);
assert.deepEqual(success.state.cleared, [["password", ""], ["mfaCode", ""]]); assert.equal(success.state.localWrites.length, 0);
for (const [status, payload, expected] of [[401, { status: "mfaRequired" }, "mfaRequired"], [401, { status: "invalidMfaCode" }, "invalidMfaCode"], [401, {}, "invalidCredentials"], [403, {}, "forbidden"], [429, {}, "rateLimited"], [503, {}, "serverUnavailable"], [200, {}, "serverUnavailable"]]) {
  const f = fixture(); const pending = f.submit(); await f.submit();
  f.resolve(Response.json(payload, { status })); await pending;
  assert.equal(f.state.requests.length, 1); assert.equal(f.state.errors.at(-1), expected);
  assert.equal(f.submittingRef.current, false); assert.equal(f.state.busy, false); assert.deepEqual(f.state.navigations, []);
  assert.equal(f.state.mfa, ["mfaRequired", "invalidMfaCode"].includes(expected));
}
const challenge = fixture({ mfaRequired: true }); await challenge.submit(); assert.equal(challenge.state.requests.length, 0); assert.equal(challenge.state.errors.at(-1), "mfaRequired");
const mfa = fixture({ mfaRequired: true, mfaCode: " 123456 ", locale: "ja" }); const pendingMfa = mfa.submit();
assert.equal(mfa.state.requests[0].body.mfaCode, "123456"); mfa.resolve(Response.json({ status: "authenticated" })); await pendingMfa; assert.deepEqual(mfa.state.navigations, ["/ja"]);
const network = fixture(); const pendingNetwork = network.submit(); network.reject(new Error("synthetic failure")); await pendingNetwork; assert.equal(network.state.errors.at(-1), "serverUnavailable"); assert.equal(network.submittingRef.current, false);
console.log("Actual login handler: duplicate lock, credential input locks, MFA challenge/code, failures, locale redirect, no live localStorage and independent mock flow passed. Synthetic credentials only.");
