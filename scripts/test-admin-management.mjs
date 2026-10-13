import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { adminFieldBounds, adminLicenseClaimCode, adminMutationPlan, managementFields, projectAdminDataset } from "../lib/tastemail/admin-management.ts";
import { adminMutationReceipt } from "../lib/tastemail/admin-mutation-receipt.ts";
const id = "11111111-1111-4111-8111-111111111111";
const plan = (resource, action, input, extra = {}) => adminMutationPlan({ resource, action, input, id, confirmed: true, ...extra });

test("paginated administrator reads reject missing flags and invalid typed cursors", () => {
  for (const resource of ["users", "queue", "audit"]) {
    for (const flag of [undefined, null, "false", "true", 0, 1]) assert.throws(() => projectAdminDataset(resource, { items: [], hasMore: flag }));
    assert.equal(projectAdminDataset(resource, { items: [], hasMore: false }).hasMore, false);
  }
  const users = { items: [], hasMore: true, nextAfterAddress: "qa@example.test", nextAfterId: id };
  assert.equal(projectAdminDataset("users", users).cursor.afterId, id);
  for (const address of ["", "missing-at", "qa@example.test\n"]) assert.throws(() => projectAdminDataset("users", { ...users, nextAfterAddress: address }));
  for (const nextId of ["", "../other", 123, id + "\n"]) assert.throws(() => projectAdminDataset("users", { ...users, nextAfterId: nextId }));
  const queue = { items: [], hasMore: true, nextBeforePriority: 0, nextBeforeNextAttemptAt: "2026-10-02T01:00:00Z", nextBeforeCreatedAt: "2026-10-01T01:00:00+00:00", nextBeforeId: id };
  assert.equal(projectAdminDataset("queue", queue).cursor.beforePriority, "0");
  for (const priority of ["0", NaN, Infinity, 0.5, -32769, 32768]) assert.throws(() => projectAdminDataset("queue", { ...queue, nextBeforePriority: priority }));
  for (const date of ["", "not-a-date", "2026-10-02", 123]) assert.throws(() => projectAdminDataset("queue", { ...queue, nextBeforeCreatedAt: date }));
  const audit = { items: [], hasMore: true, nextBeforeId: "9223372036854775807" };
  assert.equal(projectAdminDataset("audit", audit).cursor.beforeId, audit.nextBeforeId);
  for (const auditId of [id, "0", "-1", "01", "1.5", 1, "9223372036854775808"]) assert.throws(() => projectAdminDataset("audit", { ...audit, nextBeforeId: auditId }));
});

test("license claim normalization matches Rust ASCII case and Unicode whitespace rules", () => {
  for (const code of ["TM-2026-4QK7RP-K7Q4-9ZM2", " tm-2026-4qk7rp-k7q4-9zm2 ", "tm-2026-\t4qk7rp-\n k7q4-9zm2", "tm-2026-\u0085\u20034qk7rp-k7q4-9zm2"]) {
    assert.equal(adminLicenseClaimCode(code), "TM-2026-4QK7RP-K7Q4-9ZM2");
    assert.equal(plan("license", "claim", { code }).input.code, "TM-2026-4QK7RP-K7Q4-9ZM2");
  }
  for (const code of ["TE-2026-4QK7RP", "TM", "TM-2026-<script>", "TM-ſſ", "TM-ＡＢ", "TM-AA\u200B", "TM-A", "TM-" + "A".repeat(13), "TM-AA-AA-AA-AA-AA-AA", " ".repeat(1025) + "TM-AA"]) assert.throws(() => plan("license", "claim", { code }));
});

test("license file uses the Rust UTF-8 byte limit rather than JavaScript character count", () => {
  const ascii = "A".repeat(8192);
  assert.equal(plan("license", "create", { file: ascii }).input.file, ascii);
  assert.throws(() => plan("license", "create", { file: ascii + "A" }));
  const unicode = "가".repeat(2730) + "AB";
  assert.equal(new TextEncoder().encode(unicode).byteLength, 8192);
  assert.equal(plan("license", "create", { file: unicode }).input.file, unicode);
  assert.throws(() => plan("license", "create", { file: unicode + "A" }));
  assert.equal(plan("license", "create", { file: `  ${ascii}\n` }).input.file.trim(), ascii);
  assert.equal(plan("license", "create", { file: `\u0085${ascii}\u0085` }).input.file, ascii);
  assert.throws(() => plan("license", "create", { file: `\uFEFF${ascii}` }), "Rust does not trim BOM as whitespace");
  assert.throws(() => plan("license", "create", { file: "\u0085\u2003" }));
  assert.throws(() => plan("license", "create", { file: "\n\t " }));
});
test("directory actions use closed paths, methods, and input projections", () => {
  assert.deepEqual(plan("users", "create", { address: "qa@example.test", password: "synthetic-password", isAdmin: false, arbitrary: "ignored" }), { path: "/api/admin/users", method: "POST", input: { address: "qa@example.test", password: "synthetic-password", isAdmin: false } });
  assert.equal(plan("users", "password", { password: "synthetic-password" }).path, `/api/admin/users/${id}/password`);
  assert.equal(plan("users", "delete", { confirmation: "qa@example.test" }).method, "DELETE");
  assert.equal(plan("domains", "edit", { active: false }).method, "PATCH");
  assert.equal(plan("queue", "retry", {}).path, `/api/admin/queue/${id}/retry`);
  assert.throws(() => plan("queue", "edit", {}));
  assert.throws(() => plan("../../session", "create", {}));
  assert.throws(() => plan("users", "password", { password: "synthetic-password" }, { confirmed: false }));
  assert.throws(() => plan("users", "password", { password: "synthetic-password" }, { id: "../other" }));
});
test("policy/relay revisions and bounded values are mandatory", () => {
  const input = { ...Object.fromEntries(managementFields("spam-policy", "edit").map(f => [f.name, f.type === "boolean" ? true : f.type === "list" ? [] : f.type === "nullableNumber" ? null : 1])), maxContentScanChars: 1024 };
  assert.throws(() => plan("spam-policy", "edit", input));
  assert.equal(plan("spam-policy", "edit", { ...input, expectedRevision: 4 }).input.expectedRevision, 4);
  assert.throws(() => plan("users", "submission-limit", { messagesPerHour: -1 }));
  assert.equal(plan("users", "edit", { displayName: "", enabled: true, isAdmin: false, quotaBytes: "1125899906842624" }).input.displayName, null);
});
test("local relay permits literal loopback only and never forwards credentials or direct fallback", () => {
  const input = { expectedRevision: 2, enabled: true, host: "127.0.0.1", port: 25, tlsMode: "local_loopback", username: "", password: "", smtpUtf8RelayFallbackDirect: false };
  for (const host of ["127.0.0.1", "::1"]) {
    const result = plan("smtp-relay", "edit", { ...input, host });
    assert.equal(result.input.host, host);
    assert.equal(result.input.username, "");
    assert.equal("password" in result.input, false);
    assert.equal(result.input.confirmed, true);
  }
  for (const override of [{ host: "localhost" }, { host: "192.0.2.1" }, { host: "127.0.0.2" }, { host: "::ffff:127.0.0.1" }, { username: "fixture-user" }, { password: "fixture-password" }, { smtpUtf8RelayFallbackDirect: true }]) assert.throws(() => plan("smtp-relay", "edit", { ...input, ...override }));
});

test("spam policy matches Rust score bounds, ordering and list limits", () => {
  const input = { ...Object.fromEntries(managementFields("spam-policy", "edit").map(f => [f.name, f.type === "boolean" ? true : f.type === "list" ? [] : f.type === "nullableNumber" ? null : 1])), expectedRevision: 2, maxContentScanChars: 1024 };
  assert.equal(plan("spam-policy", "edit", input).input.quarantineThreshold, null);
  for (const name of ["junkThreshold", "quarantineThreshold", "rejectThreshold", "spfSoftfailScore", "spfFailScore", "dkimFailScore", "dmarcFailScore", "blocklistScore", "contentUrlThreshold", "contentUrlScore", "htmlOnlyScore", "executableAttachmentScore", "suspiciousSubjectScore", "maxContentScanChars"]) {
    const bounds = adminFieldBounds(name);
    for (const value of [bounds.min - 1, bounds.max + 1, 1.5]) assert.throws(() => plan("spam-policy", "edit", { ...input, [name]: value }), name);
  }
  for (const changes of [{ junkThreshold: 5, quarantineThreshold: 4 }, { junkThreshold: 5, rejectThreshold: 4 }, { quarantineThreshold: 10, rejectThreshold: 9 }, { spfSoftfailScore: 2, spfFailScore: 1 }]) assert.throws(() => plan("spam-policy", "edit", { ...input, ...changes }));
  const upper = { ...input, junkThreshold: 1000, quarantineThreshold: 1000, rejectThreshold: 1000, spfSoftfailScore: 1000, spfFailScore: 1000, contentUrlThreshold: 100, maxContentScanChars: 262144 };
  assert.equal(plan("spam-policy", "edit", upper).input.rejectThreshold, 1000);
  for (const name of ["suspiciousSubjectTerms", "ipReputation", "domainReputation", "allowIpNetworks", "blockIpNetworks", "allowDomains", "blockDomains"]) assert.throws(() => plan("spam-policy", "edit", { ...input, [name]: Array(257).fill("example.test") }));
  for (const term of ["", "a".repeat(129)]) assert.throws(() => plan("spam-policy", "edit", { ...input, suspiciousSubjectTerms: [term] }));
  assert.equal(plan("spam-policy", "edit", { ...input, suspiciousSubjectTerms: ["😀".repeat(128)] }).input.suspiciousSubjectTerms[0].length, 256);
});
test("quota and submission-limit controls match Rust bounds without precision loss", () => {
  for (const quotaBytes of ["0", "10737418240", "1125899906842624"]) assert.equal(plan("users", "edit", { displayName: "QA", enabled: true, isAdmin: false, quotaBytes }).input.quotaBytes, quotaBytes);
  for (const quotaBytes of ["1125899906842625", "18446744073709551615", "-1", "1.5", "1e9"]) assert.throws(() => plan("users", "edit", { displayName: "QA", enabled: true, isAdmin: false, quotaBytes }));
  for (const resource of ["users", "domains"]) {
    for (const messagesPerHour of [null, 1, 1000000]) assert.equal(plan(resource, "submission-limit", { messagesPerHour }).input.messagesPerHour, messagesPerHour);
    for (const messagesPerHour of [0, -1, 1000001, 1.5]) assert.throws(() => plan(resource, "submission-limit", { messagesPerHour }));
  }
  assert.deepEqual(adminFieldBounds("messagesPerHour"), { min: 1, max: 1000000, step: 1 });
  assert.equal(adminFieldBounds("quotaBytes").inputMode, "numeric");
});
test("product keys, webhook deletion and verified evidence obey their contracts", () => {
  assert.equal(plan("api-keys", "create", { name: "QA", scopes: ["audit.read"], expiresInDays: 30 }).input.scopes[0], "audit.read");
  assert.throws(() => plan("api-keys", "create", { name: "QA", scopes: ["users.write"], expiresInDays: null }));
  const result = plan("webhooks", "delete", { confirmation: `DELETE WEBHOOK ${id}` });
  assert.equal(new URL(`https://example.test${result.path}`).searchParams.get("confirmation"), `DELETE WEBHOOK ${id}`);
  assert.throws(() => plan("webhooks", "delete", { confirmation: "wrong" }));
  assert.throws(() => plan("webhooks", "create", { name: "QA", url: "http://example.test", eventTypes: ["*"] }));
  assert.throws(() => plan("backup-evidence", "create", { kind: "backup", status: "passed", archiveSha256: "0".repeat(64), sizeBytes: 1, startedAt: "2026-10-02T00:00:00Z", completedAt: "2026-10-02T00:01:00Z", note: "", confirmation: "pretend" }));
});
test("read projections remove hashes, relay credentials and token bodies", () => {
  const data = projectAdminDataset("api-keys", { apiKeys: [{ id, name: "QA", tokenPrefix: "tmk_test", token: "not-returned", passwordHash: "not-returned", scopes: ["audit.read"] }] });
  assert.equal("token" in data.items[0], false); assert.equal("passwordHash" in data.items[0], false);
  const relay = projectAdminDataset("smtp-relay", { revision: 0, password: "not-returned", passwordConfigured: true });
  assert.equal("password" in relay.singleton, false);
  assert.throws(() => projectAdminDataset("users", { items: [{ address: "missing-id" }] }));
  assert.throws(() => projectAdminDataset("audit", { items: [], hasMore: true }));
});
test("mutation route rejects CSRF and missing session before upstream writes", async () => {
  const source = readFileSync(new URL("../app/api/mail/admin/manage/route.ts", import.meta.url), "utf8");
  let token = null, calls = 0;
  const modules = {
    "next/server": { NextResponse: { json: (data, options) => new Response(JSON.stringify(data), options) } },
    "@/lib/tastemail/admin-management": { adminMutationPlan },
    "@/lib/tastemail/admin-mutation-receipt": { adminMutationReceipt },
    "@/lib/tastemail/session": { tastemailSessionToken: async () => token },
    "@/lib/tastemail/server": { mailDataMode: () => "live", assertLiveApiConfigured() {}, tastemailRequest: async () => { calls++; return new Response(JSON.stringify({ id }), { status: 201 }); } },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: name => modules[name], URL, URLSearchParams, Response, JSON });
  const request = origin => new Request("https://mail.example.test/api/mail/admin/manage", { method: "POST", headers: { ...(origin ? { origin } : {}), host: "mail.example.test", "content-type": "application/json" }, body: JSON.stringify({ resource: "domains", action: "create", confirmed: true, input: { name: "example.test" } }) });
  assert.equal((await exports.POST(request("https://other.test"))).status, 403);
  assert.equal((await exports.POST(request(null))).status, 403);
  assert.equal((await exports.POST(request("https://mail.example.test"))).status, 401);
  assert.equal(calls, 0);
  token = "synthetic-session";
  assert.equal((await exports.POST(request("https://mail.example.test"))).status, 200);
  assert.equal(calls, 1);
});
test("theme activation and rollback retain revision and confirmation", () => {
  const result = plan("themes", "edit", { themeId: "test-theme", themeVersion: "", density: "comfortable", colorMode: "dark", userSelectionAllowed: true, expectedRevision: 2 });
  assert.equal(result.path, "/api/admin/themes/system");
  assert.equal(result.input.themeVersion, null); assert.equal(result.input.confirmed, true);
  assert.deepEqual(plan("themes", "rollback", { expectedRevision: 2 }).input, { expectedRevision: 2, confirmed: true });
  assert.throws(() => plan("themes", "edit", { ...result.input, density: "unknown" }));
  assert.throws(() => plan("theme-packages", "create", {}));
  assert.equal(plan("theme-packages", "delete", { confirmation: id }).headers["x-tastemail-confirm"], "delete-theme");
  const projected = projectAdminDataset("themes", { system: { theme: { id: "test-theme", version: null }, density: "comfortable", colorMode: "dark", userSelectionAllowed: true, revision: 2 } });
  assert.equal(projected.singleton.themeId, "test-theme");
});
test("license actions use distinct endpoints and typed deletion", () => {
  assert.equal(plan("license", "claim", { code: "TM-2026-TEST" }).path, "/api/admin/license/claim");
  assert.throws(() => plan("license", "claim", { code: "invalid" }));
  assert.throws(() => plan("license", "delete", { confirmation: "anything" }));
  assert.equal(plan("license", "delete", { confirmation: "DELETE LICENSE" }).method, "DELETE");
  assert.equal(plan("license", "create", { file: "synthetic\nlicense\nsignature" }).method, "POST");
  const data = projectAdminDataset("license", { status: "active", unlocked: true, privateKey: "not-returned", file: "not-returned" });
  assert.equal("privateKey" in data.singleton, false); assert.equal("file" in data.singleton, false);
});
test("theme upload rejects cross-origin requests before reading bytes", async () => {
  const source = readFileSync(new URL("../app/api/mail/admin/theme-package/route.ts", import.meta.url), "utf8");
  let calls = 0;
  const modules = { "next/server": { NextResponse: { json: (data, options) => new Response(JSON.stringify(data), options) } }, "@/lib/tastemail/session": { tastemailSessionToken: async () => "synthetic-session" }, "@/lib/tastemail/server": { mailDataMode: () => "live", assertLiveApiConfigured() {}, tastemailRequest: async (_path, _token, input) => { calls++; assert.equal(input.headers["x-tastemail-confirm"], "install-theme"); return new Response(JSON.stringify({ id }), { status: 200 }); } } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: name => modules[name], URL, Response, JSON, Uint8Array, AbortSignal });
  const request = (origin, body = new Uint8Array([80, 75, 3, 4])) => new Request("https://mail.example.test/api/mail/admin/theme-package", { method: "POST", headers: { origin, host: "mail.example.test", "content-type": "application/zip", "x-gxwebmail-confirm": "install-theme" }, body });
  assert.equal((await exports.POST(request("https://other.test"))).status, 403); assert.equal(calls, 0);
  assert.equal((await exports.POST(request("https://mail.example.test", new Uint8Array()))).status, 400);
  assert.equal((await exports.POST(request("https://mail.example.test"))).status, 200); assert.equal(calls, 1);
});
