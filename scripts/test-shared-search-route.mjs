// Executes the current GET route with synthetic service/session dependencies only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const account = "11111111-1111-4111-8111-111111111111";
const mailbox = "22222222-2222-4222-8222-222222222222";
let mode = "live";
let configured = true;
let token = "synthetic-token";
let tokenReads = 0;
let forwarded = [];
let serviceError = null;
class MailServiceError extends Error {
  constructor(status) { super(status); this.status = status; }
}
class InvalidSearchFilterError extends Error {}
const result = { accountId: account, mailboxId: mailbox, mailboxes: [], position: 0, total: 0, limit: 50, messages: [] };
const routeModule = { exports: {} };
const source = readFileSync(new URL("../app/api/mail/shared-messages/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
new Function("require", "exports", "module", compiled)((name) => {
  if (name === "next/server") return { NextResponse: { json: (data, init) => Response.json(data, init) } };
  if (name === "@/lib/tastemail/server") return {
    mailDataMode: () => mode,
    assertLiveApiConfigured: () => { if (!configured) throw new Error("synthetic configuration failure"); },
  };
  if (name === "@/lib/tastemail/session") return { tastemailSessionToken: async () => { tokenReads++; return token; } };
  if (name === "@/lib/tastemail/mail") return {
    MailServiceError, InvalidSearchFilterError,
    loadLiveSharedMailPage: async (...args) => {
      forwarded.push(args);
      if (serviceError) throw serviceError;
      return result;
    },
    updateLiveSharedMailFlag: () => { throw new Error("GET must never mutate mail"); },
  };
  throw new Error(`Unexpected dependency ${name}`);
}, routeModule.exports, routeModule);

async function check(params, expectedCode, expectedStatus) {
  const response = await routeModule.exports.GET(new Request(`https://fixture.example.test/api/mail/shared-messages?${new URLSearchParams(params)}`));
  assert.equal(response.status, expectedCode);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  if (expectedStatus) assert.equal(body.status, expectedStatus);
  return { response, body };
}
const base = { accountId: account, mailboxId: mailbox };
assert.equal(tokenReads, 0);
assert.equal(forwarded.length, 0);
mode = "live";
configured = false;
await check(base, 503, "configuration_error");
assert.equal(tokenReads, 0);
configured = true;
for (const params of [
  {}, { ...base, accountId: "wrong" }, { ...base, mailboxId: "wrong" },
  ...["-1", "01", "1.5", "100001", "Infinity"].map(position => ({ ...base, position })),
  { ...base, q: "x".repeat(257) }, { ...base, q: "inside\u0000query" }, { ...base, q: "inside\nquery" },
]) await check(params, 400, "invalid_request");
assert.equal(tokenReads, 0);
assert.equal(forwarded.length, 0);

token = null;
await check(base, 401, "unauthorized");
assert.equal(forwarded.length, 0);
token = "synthetic-token";
const accepted = await check({ ...base, position: "50", q: '  subject:"한글 & + #"  ' }, 200);
assert.deepEqual(forwarded.at(-1), [token, account, mailbox, 50, 'subject:"한글 & + #"']);
assert.deepEqual(accepted.body, result);
assert.match(accepted.response.headers.get("server-timing"), /^tastemail;dur=\d+\.\d$/);
await check({ accountId: account, q: " " }, 200);
assert.deepEqual(forwarded.at(-1), [token, account, null, 0, ""]);
await check({ ...base, q: "x".repeat(256) }, 200);
for (const [status, code] of [["unauthorized", 401], ["forbidden", 403], ["rateLimited", 429], ["retryable", 503], ["unavailable", 502]]) {
  serviceError = new MailServiceError(status);
  await check(base, code, status);
}
serviceError = new InvalidSearchFilterError();
await check({ ...base, q: "is:unknown" }, 400, "invalid_request");
serviceError = new Error("synthetic internal detail must not leak");
const failed = await check(base, 503, "retryable");
assert.deepEqual(failed.body, { status: "retryable" });
console.log("Shared-search GET: mock/config/auth boundaries, input limits, account/folder forwarding and error mappings passed (synthetic only).");
