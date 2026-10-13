#!/usr/bin/env node
// Exercise the server-only API boundary without making a network request.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const source = readFileSync(fileURLToPath(new URL("../lib/tastemail/server.ts", import.meta.url)), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
function loadPure(url) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", code)(name => {
    assert.ok(name.startsWith("./") || name.startsWith("../"));
    return loadPure(new URL(`${name}.ts`, url));
  }, exports);
  return exports;
}
new Function("require", "exports", "module", compiled)(
  (name) => {
    if (name === "../linked-operations") return loadPure(new URL("../lib/linked-operations.ts", import.meta.url));
    assert.equal(name, "server-only");
    return {};
  }, compiledModule.exports, compiledModule,
);
const { validateApiOrigin, tastemailRequest, tastemailVerifyLinkedAccount } = compiledModule.exports;

assert.equal(validateApiOrigin("http://127.0.0.1:7531"), "http://127.0.0.1:7531");
assert.equal(validateApiOrigin("http://[::1]:7531"), "http://[::1]:7531");
assert.equal(validateApiOrigin("https://api.example.test:7531"), "https://api.example.test:7531");
for (const host of ["192.168.0.109", "10.0.0.1", "172.16.0.1", "172.31.255.255"]) {
  assert.throws(() => validateApiOrigin(`http://${host}:6711`));
  assert.equal(validateApiOrigin(`https://${host}:6711`), `https://${host}:6711`);
}
for (const address of [
  "http://172.15.0.1:6711", "http://172.32.0.1:6711", "http://192.169.0.109:6711",
  "http://8.8.8.8:6711", "http://169.254.169.254:6711", "http://192.168.0.109.example.test:6711",
  "http://user:pass@192.168.0.109:6711", "http://192.168.0.109:6711/jmap/api",
  "http://api.example.test:7531", "https://user:pass@api.example.test",
  "https://api.example.test/jmap/api", "https://api.example.test/?token=fixture", "not a URL",
]) assert.throws(() => validateApiOrigin(address));

const previousUrl = process.env.TASTEMAIL_API_URL;
const previousFetch = globalThis.fetch;
const requests = [];
try {
  process.env.TASTEMAIL_API_URL = "https://api.example.test:7531";
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: 200 });
  };
  await tastemailRequest("/health");
  await tastemailRequest("/jmap/api", "fixture-token", { method: "POST" });
  assert.deepEqual(requests.map((request) => request.url), [
    "https://api.example.test:7531/health", "https://api.example.test:7531/jmap/api",
  ]);
  assert.equal(new Headers(requests[0].init.headers).has("authorization"), false);
  assert.equal(new Headers(requests[1].init.headers).get("authorization"), "Bearer fixture-token");
  for (const { init } of requests) {
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
  }
  assert.throws(() => tastemailRequest("//untrusted.example.test/path", "fixture-token"));
  for (const path of ["/\\untrusted.example.test/path", "/\n/untrusted.example.test/path", "/\t/host", "/api/health\u0000", "/api/health path"]) {
    assert.throws(() => tastemailRequest(path, "fixture-token"), "ambiguous paths must fail before fetch");
  }
  process.env.TASTEMAIL_API_URL = "http://192.168.0.109:6711";
  assert.throws(() => tastemailRequest("/health"));
  assert.throws(() => tastemailRequest("/api/auth/session", undefined, {
    method: "POST", body: JSON.stringify({ password: "fixture-password" }),
  }));
  assert.throws(() => tastemailRequest("/jmap/api", "fixture-token", { method: "POST" }));
  assert.throws(() => tastemailRequest("/jmap/api", undefined, {
    headers: { authorization: "Bearer fixture-token" },
  }));
  assert.equal(requests.length, 2, "unsafe origins must fail before fetch, including login without a token");
  process.env.TASTEMAIL_API_URL = "http://api.example.test:7531";
  assert.throws(() => tastemailRequest("/health", "fixture-token"));
  assert.equal(requests.length, 2);
  delete process.env.TASTEMAIL_API_URL;
  await tastemailRequest("/health");
  assert.equal(requests[2].url, "http://127.0.0.1:6711/health");
  for (const path of ["../app/api/mail/setup/connection/route.ts", "../components/setup/DevApiConnectionSetup.tsx", "../components/setup/LiveInitialSetup.tsx"]) {
    const setup = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(setup.includes("6711"), `${path} must match the current server default`);
    assert.equal(setup.includes("7531"), false, `${path} must not advertise the old default`);
  }
  const originalTimeout = AbortSignal.timeout;
  const deadlines = [];
  try {
    AbortSignal.timeout = milliseconds => { const controller = new AbortController(); deadlines.push({ milliseconds, controller }); return controller.signal; };
    const caller = new AbortController();
    await tastemailRequest("/health", undefined, { signal: caller.signal });
    const combined = requests.at(-1).init.signal;
    assert.notEqual(combined, caller.signal);
    assert.equal(deadlines.at(-1).milliseconds, 15_000);
    caller.abort("caller cancelled");
    assert.equal(combined.aborted, true); assert.equal(combined.reason, "caller cancelled");
    await tastemailRequest("/health", undefined, { signal: new AbortController().signal });
    const bounded = requests.at(-1).init.signal;
    deadlines.at(-1).controller.abort("deadline");
    assert.equal(bounded.aborted, true); assert.equal(bounded.reason, "deadline");
    await tastemailRequest("/health");
    assert.equal(deadlines.at(-1).milliseconds, 10_000);
    const id = "11111111-1111-4111-8111-111111111111";
    await tastemailVerifyLinkedAccount(id, "fixture-token", 2);
    assert.equal(deadlines.at(-1).milliseconds, 65_000);
    assert.equal(requests.at(-1).url, `http://127.0.0.1:6711/api/user/linked-accounts/${id}/verify`);
    assert.deepEqual(JSON.parse(requests.at(-1).init.body), { expectedRevision: 2 });
    for (const [badId, revision] of [["//host", 2], [id, 0], [id, NaN], [id, 1.5]]) assert.throws(() => tastemailVerifyLinkedAccount(badId, "fixture-token", revision));
  } finally { AbortSignal.timeout = originalTimeout; }
} finally {
  if (previousUrl === undefined) delete process.env.TASTEMAIL_API_URL;
  else process.env.TASTEMAIL_API_URL = previousUrl;
  globalThis.fetch = previousFetch;
}

process.stdout.write("TASTEMAIL server-only origin and request boundary passed\n");
