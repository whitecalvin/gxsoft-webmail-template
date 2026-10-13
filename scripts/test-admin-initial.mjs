import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as management from "../lib/tastemail/admin-management.ts";
import * as shared from "../lib/tastemail/admin-shared-contract.ts";
import * as drafts from "../lib/admin-shared-drafts.ts";
import { adminInitialReadGate } from "../lib/admin-initial-read.ts";
import * as dkimSelection from "../lib/admin-dkim-selection.ts";
import { adminDkimFixture } from "./fixtures/admin-dkim.mjs";

function compile(file, modules, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, URLSearchParams, AbortController, AbortSignal, ...globals, require: name => { assert.ok(name in modules, name); return modules[name]; } });
  return exports;
}
const id = "11111111-1111-4111-8111-111111111111";
const mailbox = { id, address: "team@example.test", displayName: "SSR shared marker", quotaBytes: 100, usedBytes: 4, revision: 1, rights: { mayRead: true, mayWrite: true, maySend: true, mayManage: true } };
const quarantined = { items: [{ id, recipient: "qa@example.test", envelopeSender: null, subject: "SSR quarantine marker", sizeBytes: "1024", spamScore: 10, createdAt: "2026-10-12T00:00:00Z" }], hasMore: false, nextBeforeCreatedAt: null, nextBeforeId: null };
const dataset = { items: [{ id, name: "SSR managed marker" }], hasMore: false, cursor: {} };

test("initial gate skips both StrictMode reads, but refresh and first-page return refetch", () => {
  const gate = adminInitialReadGate(true, "initial");
  assert.equal(gate("initial"), true); assert.equal(gate("initial"), true);
  assert.equal(gate("page2"), false); assert.equal(gate("initial"), false);
  assert.equal(adminInitialReadGate(false, "initial")("initial"), false);
  const refresh = adminInitialReadGate(true, "0"); assert.equal(refresh("0"), true); assert.equal(refresh("1"), false); assert.equal(refresh("0"), false);
});

test("server initial loader uses actual closed services for every section and retains errors", async () => {
  let calls = [], failure = null, status = 200;
  class AdminServiceError extends Error { constructor(status) { super(); this.status = status; } }
  class MailServiceError extends Error { constructor(status) { super(); this.status = status; } }
  const modules = { "server-only": {}, "../admin-dkim-selection": dkimSelection, "./admin": { AdminServiceError, loadAdminManagement: async (token, section, query) => { calls.push(section); assert.equal(token, "synthetic"); assert.equal(query.toString(), section === "dkim" ? "domain=example.test" : ""); if (failure) throw failure; return dataset; } },
    "./admin-shared-contract": shared, "./mail": { MailServiceError }, "./quarantine": { loadLiveQuarantinePage: async (token, before, key) => { calls.push("quarantine"); assert.equal(before, null); assert.equal(key, null); if (failure) throw failure; return quarantined; } },
    "./server": { serviceStatus: status => ({ 401: "unauthorized", 403: "forbidden", 429: "rateLimited" })[status] ?? "retryable", tastemailRequest: async path => { calls.push(path); return Response.json({ items: path.startsWith("/api/admin/domains") ? [{ id, name: "example.test", active: true }] : [mailbox], rawBody: "must-not-project" }, { status }); } } };
  const { loadAdminInitialState } = compile("../lib/tastemail/admin-initial.ts", modules);
  for (const section of [...management.adminResources, "quarantine", "shared-mailboxes"]) {
    const count = calls.length;
    const result = await loadAdminInitialState(section, "synthetic"); assert.equal(result.section, section); assert.equal(result.error, null);
    if (section === "domain-theme") { assert.equal(result.management, undefined); assert.equal(calls.length, count); }
    else if (section === "dkim") { assert.equal(result.management, dataset); assert.equal(result.dkimDomains[0].name, "example.test"); }
    else if (section === "shared-mailboxes") { assert.equal(result.shared[0].displayName, mailbox.displayName); assert.equal(result.rawBody, undefined); }
    else if (section === "quarantine") assert.equal(result.quarantine, quarantined);
    else assert.equal(result.management, dataset);
    if (section !== "domain-theme") assert.equal(calls.at(-1), section === "shared-mailboxes" ? "/api/admin/shared-mailboxes" : section);
  }
  const before = calls.length;
  assert.equal((await loadAdminInitialState("users", null)).error, "unauthorized"); assert.equal(calls.length, before);
  for (const code of ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]) {
    failure = new AdminServiceError(code); assert.equal((await loadAdminInitialState("users", "synthetic")).error, code);
    failure = new MailServiceError(code); assert.equal((await loadAdminInitialState("quarantine", "synthetic")).error, code);
  }
  for (const [code, error] of [[402, "licenseLimit"], [404, "notFound"], [409, "conflict"], [401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"]]) { status = code; assert.equal((await loadAdminInitialState("shared-mailboxes", "synthetic")).error, error); }
  failure = new Error(); assert.equal((await loadAdminInitialState("users", "synthetic")).error, "unavailable");
});

test("server page passes initial snapshot to its section, including usage and unauthorized state", async () => {
  const modules = { "react/jsx-runtime": jsx, "next/navigation": { notFound: () => { throw Error("not-found"); } }, "@/lib/admin-navigation": { isAdminSection: section => [...management.adminResources, "shared-mailboxes", "quarantine"].includes(section) },
    "@/components/admin/LiveAdminSection": { LiveAdminSection: "section" }, "@/components/admin/AdminUsageReport": { AdminUsageReport: "usage" }, "@/lib/tastemail/session": { tastemailSessionToken: async () => "synthetic" },
    "@/lib/tastemail/admin-initial": { loadAdminInitialState: async section => ({ section, error: null, management: { ...dataset, usage: { totalUsers: 12 } } }) } };
  const page = compile("../app/[locale]/admin/[section]/page.tsx", modules).default;
  for (const section of ["users", "shared-mailboxes", "quarantine"]) { const element = await page({ params: Promise.resolve({ section }) }); assert.equal(element.props.initial.section, section); assert.equal(element.props.section, section); }
  assert.equal((await page({ params: Promise.resolve({ section: "reports" }) })).props.initialUsage.totalUsers, 12);
  await assert.rejects(page({ params: Promise.resolve({ section: "unknown" }) }));
});

test("actual generic, shared and quarantine clients SSR initial data and do not fetch again", () => {
  const passthrough = ({ children }) => React.createElement("div", null, children);
  const form = compile("../lib/admin-form.ts", { "./tastemail/admin-management": management });
  for (const [file, name, props, marker] of [
    ["LiveAdminManager", "LiveAdminManager", { resource: "domains", initialData: dataset }, "SSR managed marker"],
    ["LiveAdminManager", "LiveAdminManager", { resource: "dkim", initialData: management.projectAdminDataset("dkim", adminDkimFixture()), dkimDomains: [{ id, name: "example.test" }] }, "synthetic-qa"],
    ["AdminSharedMailboxes", "AdminSharedMailboxes", { initialItems: [mailbox] }, "SSR shared marker"],
    ["AdminQuarantine", "AdminQuarantine", { initialPage: quarantined }, "SSR quarantine marker"],
  ]) {
    const effects = [];
    const modules = { "react/jsx-runtime": jsx, react: { ...React, useEffect: effect => effects.push(effect) }, "next-intl": { useTranslations: () => key => key, useFormatter: () => ({ number: value => String(value), dateTime: value => value.toISOString() }) },
      "@/i18n/navigation": { useRouter: () => ({}) }, "./AdminShell": { AdminPageActions: passthrough, useAdminShell: () => ({ setMutationBusy() {} }) },
      "./AdminDraftGuard": { useAdminDraftProtection() {}, useAdminDraftGuard: () => ({ requestAction() {} }) },
      "@/components/ui/Button": { Button: ({ children }) => React.createElement("button", null, children) }, "@/components/ui/CustomSelect": { CustomSelect: "select" },
      "@/components/ui/CopyValueButton": { CopyValueButton: passthrough },
      "@/components/toast/SystemErrorNotice": { SystemErrorNotice: ({ message }) => React.createElement("p", { role: "alert" }, message) }, "@/components/overlay/ConfirmDialog": { ConfirmDialog: passthrough },
      "./AdminQuotaInput": { AdminQuotaInput: passthrough }, "./AdminListInput": { AdminListInput: passthrough }, "./AdminLicenseFilePicker": { AdminLicenseFilePicker: passthrough }, "./AdminSpamPolicyEditor": { AdminSpamPolicyEditor: passthrough },
      "./AdminDkimOverview": { AdminDkimOverview: passthrough },
      "./AdminStorageUsage": { AdminStorageUsage: passthrough }, "./AdminUserDeletionReport": { AdminUserDeletionReport: passthrough },
      "@/lib/admin-initial-read": { adminInitialReadGate }, "@/lib/admin-dkim-selection": dkimSelection, "@/lib/admin-form": form, "@/lib/tastemail/admin-management": management, "@/lib/tastemail/admin-theme-catalog": {},
      "@/lib/admin-shared-drafts": drafts, "@/lib/tastemail/admin-shared-contract": shared, "@/lib/admin-spam-policy": {}, };
    const component = compile(`../components/admin/${file}.tsx`, modules, { fetch: () => assert.fail("initial SSR must not refetch") })[name];
    const html = renderToStaticMarkup(React.createElement(component, props)); assert.ok(html.includes(marker));
    for (const effect of effects) { effect(); effect(); }
    effects.length = 0;
    const denied = renderToStaticMarkup(React.createElement(component, { ...(props.resource ? { resource: props.resource } : {}), initialError: "forbidden" }));
    assert.match(denied, /role="alert"/); assert.ok(!denied.includes(marker));
    for (const effect of effects) { effect(); effect(); }
  }
});

test("actual refresh effects still fetch, and returning to the first page does not retain old SSR data", async () => {
  for (const [file, key, payload] of [["LiveAdminManager", JSON.stringify({ resource: "domains", query: "", actorQuery: "", cursor: {}, revision: 0 }), dataset], ["AdminSharedMailboxes", "0", { items: [mailbox] }], ["AdminQuarantine", "0|", quarantined]]) {
    const source = ts.createSourceFile(file, readFileSync(new URL(`../components/admin/${file}.tsx`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let callback;
    const visit = node => { if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("initialRead.current")) callback = node.arguments[0]; ts.forEachChild(node, visit); };
    visit(source); assert.ok(callback);
    let reads = 0;
    const bindings = { initialRead: { current: adminInitialReadGate(true, key) }, resource: "domains", query: "", actorQuery: "", cursor: file === "AdminQuarantine" ? "" : {}, revision: 0,
      AbortController, AbortSignal, URLSearchParams, adminSharedList: shared.adminSharedList, adminFilterKey: management.adminFilterKey,
      fetch: async () => { reads++; return Response.json(payload); },
    };
    for (const name of ["Loading", "Busy", "Error", "Data", "Items", "Selected", "Confirmed", "Page"]) bindings[`set${name}`] = () => {};
    const invoke = () => new Function(...Object.keys(bindings), `return (${ts.transpileModule(callback.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText.trim().replace(/;$/, "")})();`)(...Object.values(bindings));
    assert.equal(invoke(), undefined); assert.equal(invoke(), undefined); assert.equal(reads, 0);
    bindings.revision = 1; const cleanup = invoke(); await new Promise(resolve => setImmediate(resolve)); assert.equal(reads, 1); cleanup();
    bindings.revision = 0; const returned = invoke(); await new Promise(resolve => setImmediate(resolve)); assert.equal(reads, 2); returned();
  }
});
