import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { adminSetupReadiness } from "../lib/admin-setup-readiness.ts";
import { adminDkimSnapshot } from "../lib/tastemail/admin-management.ts";
import { adminDkimFixture } from "./fixtures/admin-dkim.mjs";
import { adminInitialReadGate } from "../lib/admin-initial-read.ts";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
const operations = { database: { status: "connected", schemaStatus: "current" }, certificate: { status: "valid" }, listeners: [{ status: "configured" }] };
const dataset = items => ({ items, hasMore: false, cursor: {} });

test("actual readiness SSR localizes unknown state without treating failed lookup as completion", () => {
  for (const locale of ["ko", "en", "ja", "zh", "zh-hant", "de", "fr", "es", "it", "pt"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const modules = { "react/jsx-runtime": jsx, "@/lib/admin-setup-readiness": { adminSetupReadiness }, "@/lib/admin-setup-navigation": { adminSetupStages: ["domain", "dkim", "dns", "mailbox", "verify"] }, "next-intl": { useTranslations: namespace => createTranslator({ locale, messages, namespace }) }, "./AdminShell": { useAdminShell: () => ({ initial: operations }) } };
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/admin/AdminSetupReadiness.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => modules[name] });
    const html = renderToStaticMarkup(React.createElement(exports.AdminSetupReadiness, { domain: "example.test", dkim: { error: "unavailable" }, users: { error: "forbidden" } }));
    assert.equal((html.match(/<dt /g) ?? []).length, 5);
    assert.ok(html.includes(renderToStaticMarkup(React.createElement(React.Fragment, null, messages.liveService.unavailable))), locale);
    assert.ok(!html.includes("100%"));
  }
});

test("manual DNS and production acceptance guidance SSR exists in all ten locales", () => {
  for (const locale of ["ko", "en", "ja", "zh", "zh-hant", "de", "fr", "es", "it", "pt"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const modules = { "react/jsx-runtime": jsx, "next-intl": { useTranslations: namespace => createTranslator({ locale, messages, namespace }) } };
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/admin/AdminSetupGuidance.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => modules[name] });
    const dns = renderToStaticMarkup(React.createElement(exports.AdminSetupGuidance, { stage: "dns" }));
    assert.equal((dns.match(/<li>/g) ?? []).length, 3);
    assert.ok(dns.includes("A/AAAA")); assert.ok(dns.includes("PTR")); assert.ok(dns.includes("SMTP"));
    const verify = renderToStaticMarkup(React.createElement(exports.AdminSetupGuidance, { stage: "verify" }));
    for (const value of ["SPF", "DKIM", "DMARC", "PTR", "TLS"]) assert.ok(verify.includes(value));
    assert.equal(renderToStaticMarkup(React.createElement(exports.AdminSetupGuidance, { stage: "domain" })), "");
  }
});

test("setup readiness requires matching domain, all DNS evidence and service prerequisites", () => {
  const raw = adminDkimFixture("active.example.test");
  raw.records.filter(record => record.recordType !== "PTR").forEach(record => record.status = "published");
  const dkim = { ...dataset([]), ...adminDkimSnapshot(raw) };
  const users = dataset([{ address: "qa@ACTIVE.EXAMPLE.TEST" }]);
  assert.deepEqual(adminSetupReadiness(raw.domain, dkim, users, operations), { domain: true, dkim: true, dns: true, mailbox: true, verify: true });
  for (const records of [[], raw.records.filter(record => record.recordType === "PTR"), raw.records.filter(record => record.recordType === "MX")]) assert.equal(adminSetupReadiness(raw.domain, { ...dkim, dkim: { ...dkim.dkim, records } }, users, operations).dns, false);
  assert.equal(adminSetupReadiness("other.test", dkim, users, operations).dns, null);
  assert.equal(adminSetupReadiness(raw.domain, undefined, undefined, operations).dkim, null);
  assert.equal(adminSetupReadiness(raw.domain, dkim, dataset([{ address: "qa@other.test" }]), operations).mailbox, false);
  for (const status of ["missing", "manual", "unavailable"]) {
    const records = raw.records.map(record => record.recordType === "MX" ? { ...record, status } : record);
    assert.equal(adminSetupReadiness(raw.domain, { ...dkim, dkim: { ...dkim.dkim, records } }, users, operations).dns, false);
  }
  for (const patch of [{ listeners: [] }, { listeners: [{ status: "disabled" }] }, { certificate: { status: "expiring" } }, { database: { status: "connected", schemaStatus: "outdated" } }]) assert.equal(adminSetupReadiness(raw.domain, dkim, users, { ...operations, ...patch }).verify, false);
});

test("actual setup SSR loader reuses selected DKIM and scopes users to that domain", async () => {
  const calls = [], exports = {};
  let error = null, domain = "selected.test", userFailure = false;
  class AdminServiceError extends Error { constructor(status) { super(status); this.status = status; } }
  const modules = { "server-only": {}, "./admin-initial": { loadAdminInitialState: async section => { calls.push(section); return { section, error, ...(section === "dkim" && domain && !error ? { management: { dkim: { domain }, items: [] } } : {}) }; } }, "./admin": { AdminServiceError, loadAdminManagement: async (_token, resource, query) => { calls.push([resource, query.get("domain")]); if (userFailure) throw new AdminServiceError("forbidden"); return dataset([{ address: `qa@${domain}` }]); } } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/tastemail/admin-setup.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, URLSearchParams, require: name => modules[name] });
  const load = exports.loadAdminSetup;
  assert.equal((await load("synthetic", "mailbox", "requested.test")).initial.management.items[0].address, "qa@selected.test");
  assert.deepEqual(calls, ["dkim", ["users", "selected.test"]]);
  calls.length = 0; error = "unauthorized";
  assert.equal((await load(null, "dns")).initial.error, "unauthorized");
  assert.deepEqual(calls, ["dkim"]);
  error = null; domain = undefined; calls.length = 0;
  assert.equal((await load("synthetic", "mailbox")).initial.error, "notFound");
  assert.deepEqual(calls, ["dkim"]);
  domain = "selected.test"; userFailure = true;
  assert.equal((await load("synthetic", "mailbox")).initial.error, "forbidden");
});

test("actual user refresh and pagination keep the setup domain with search and cursors", async () => {
  const source = ts.createSourceFile("manager", readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => { if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("initialRead.current")) callback = node.arguments[0]; ts.forEachChild(node, visit); };
  visit(source); assert.ok(callback);
  let request;
  const bindings = { initialRead: { current: adminInitialReadGate(false, "") }, resource: "users", query: "qa", actorQuery: "", cursor: { afterAddress: "previous@selected.test", afterId: "11111111-1111-4111-8111-111111111111" }, revision: 1, fixedDomain: "selected.test", AbortController, AbortSignal, URLSearchParams, adminFilterKey: () => "q", setData() {}, setError() {}, setLoading() {}, fetch: async path => { request = new URL(path, "http://localhost"); return Response.json(dataset([])); } };
  const cleanup = new Function(...Object.keys(bindings), `return (${ts.transpileModule(callback.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText.trim().replace(/;$/, "")})();`)(...Object.values(bindings));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(request.searchParams.get("domain"), "selected.test");
  assert.equal(request.searchParams.get("q"), "qa");
  assert.equal(request.searchParams.get("afterAddress"), "previous@selected.test");
  cleanup();
});

test("setup verification refresh is guarded and remounts detail on the same SSR observation", () => {
  let refreshes = 0, approved;
  const exports = {};
  const modules = { "react/jsx-runtime": jsx, "@/i18n/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) }, "./AdminShell": { useAdminShell: () => ({ initial: { observedAt: "2026-10-13T00:00:00Z" } }) }, "./LiveAdminConsole": { LiveAdminConsole: "Console" }, "./AdminDraftGuard": { useAdminDraftGuard: () => ({ requestAction: action => approved = action }) } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/admin/AdminSetupVerify.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => modules[name] });
  const element = exports.AdminSetupVerify();
  assert.equal(element.key, "2026-10-13T00:00:00Z");
  element.props.onRefresh();
  assert.equal(refreshes, 0);
  approved();
  assert.equal(refreshes, 1);
  const messages = JSON.parse(readFileSync(new URL("../messages/ko.json", import.meta.url), "utf8"));
  assert.equal(createTranslator({ locale: "ko", messages, namespace: "setup" })("countSummary", { passed: 3, total: 5 }), "5개 중 3개 통과");
});

test("actual setup domain filter changes the guarded SSR route, not only the local DKIM table", () => {
  const source = ts.createSourceFile("manager", readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  const visit = value => { if (ts.isFunctionDeclaration(value) && value.name?.text === "applyFilter") node = value; ts.forEachChild(value, visit); };
  visit(source); assert.ok(node);
  let approved, destination;
  const local = [];
  const bindings = { resource: "dkim", setupStage: "dns", filter: " other.test ", actorFilter: "", URLSearchParams, requestAction: action => approved = action, router: { push: url => destination = url } };
  for (const name of ["Command", "Confirmed", "Details", "Query", "ActorQuery", "Cursor", "History", "Revision"]) bindings[`set${name}`] = value => local.push([name, value]);
  const code = ts.transpileModule(node.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const invoke = () => new Function(...Object.keys(bindings), `${code}; return applyFilter;`)(...Object.values(bindings))({ preventDefault() {} });
  invoke(); assert.equal(destination, undefined); assert.equal(local.length, 0);
  approved();
  assert.equal(destination, "/admin/onboarding?stage=dns&domain=other.test");
  assert.equal(local.length, 0);
  destination = undefined; bindings.setupStage = undefined;
  invoke(); approved();
  assert.equal(destination, undefined);
  assert.ok(local.some(([name, value]) => name === "Query" && value === "other.test"));
});
