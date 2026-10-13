import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import * as contract from "../lib/admin-remote-contract.ts";
import { adminRemoteFixture } from "./fixtures/admin-remote.mjs";
const compile = (file, modules) => { const exports = {}; vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, URL, require: name => { assert.ok(name in modules, name); return modules[name]; } }); return exports; };
test("remote management preserves false/zero/null and projects no server secrets", () => {
  const v = adminRemoteFixture(); v.node.allowedPrimaryApis = ["must-not-project"]; v.password = "must-not-project";
  const data = contract.adminRemoteSnapshot(v); assert.equal(data.updates.policy.hourUtc, 0); assert.equal(data.node.sharedDatabaseVerified, false); assert.equal(data.updates.rollbackVersion, null); assert.ok(!JSON.stringify(data).includes("must-not-project")); assert.equal(data.operation.phase, "accepted");
  for (const key of Object.keys(adminRemoteFixture())) { const copy = adminRemoteFixture(); delete copy[key]; assert.throws(() => contract.adminRemoteSnapshot(copy), key); }
  for (const parent of ["network", "node", "updates"]) for (const key of Object.keys(v[parent])) { if (key === "allowedPrimaryApis") continue; const copy = adminRemoteFixture(); delete copy[parent][key]; assert.throws(() => contract.adminRemoteSnapshot(copy), `${parent}.${key}`); }
  for (const primaryApi of ["http://example.test", "https://user:pass@example.test", "https://example.test/api", "https://example.test?key=x"]) { const copy = adminRemoteFixture(); copy.node.primaryApi = primaryApi; assert.throws(() => contract.adminRemoteSnapshot(copy)); }
  for (const phase of ["accepted", "running", "succeeded", "failed", "rolled_back", "recovery_required"]) { const copy = adminRemoteFixture(); copy.operation.phase = phase; assert.equal(contract.adminRemoteSnapshot(copy).operation.phase, phase); }
  const bad = adminRemoteFixture(); bad.updates.phase = "success"; assert.throws(() => contract.adminRemoteSnapshot(bad));
});
test("actual server loader distinguishes unsupported, auth, limits and malformed state", async () => {
  let status = 200, payload = adminRemoteFixture();
  const { loadAdminRemote } = compile("../lib/tastemail/admin-remote.ts", { "server-only": {}, "../admin-remote-contract": contract, "./server": { serviceStatus: s => ({401:"unauthorized",403:"forbidden",429:"rateLimited"})[s] ?? "retryable", tastemailRequest: async (path, token) => { assert.equal(path, "/api/admin/management"); assert.equal(token, "synthetic"); return Response.json(payload, { status }); } } });
  assert.equal((await loadAdminRemote("synthetic")).network.apiPort, 6711);
  for (const [s, expected] of [[401,"unauthorized"],[403,"forbidden"],[429,"rateLimited"],[404,"unsupported"],[501,"unsupported"],[503,"retryable"]]) { status = s; await assert.rejects(loadAdminRemote("synthetic"), e => e.status === expected); }
  status = 501; payload = {code:"management_not_configured"}; await assert.rejects(loadAdminRemote("synthetic"), e => e.status === "managementNotConfigured");
  payload = {code:"network_unsupported"}; await assert.rejects(loadAdminRemote("synthetic"), e => e.status === "unsupported");
  status = 200; payload = {}; await assert.rejects(loadAdminRemote("synthetic"), e => e.status === "unavailable");
});
test("management rendering uses ten locales and keeps acceptance distinct from completion", () => {
  for (const locale of ["ko","en","ja","zh","zh-hant","de","fr","es","it","pt"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(messages.adminRemoteStates).sort(),["not_configured","idle","checking","available","up_to_date","downloading","installing","verifying","installed","rolling_back","rolled_back","failed","recovery_required","integrated","bridge"].sort());
    const modules = { "react/jsx-runtime": jsx, react: React, "next-intl": { useTranslations: namespace => createTranslator({locale,messages,namespace}), useFormatter: () => ({ number: String, dateTime: d => d.toISOString() }) }, "@/lib/admin-remote-contract": contract, "@/components/ui/Button": {Button:"button"}, "@/components/toast/SystemErrorNotice": {SystemErrorNotice:({message})=>React.createElement("p",null,message)}, "./AdminShell": {AdminPageActions:({children})=>children} };
    const operationModules={...modules,"@/components/ui/Input":{Input:"input"},"@/components/ui/CustomSelect":{CustomSelect:"select"},"@/components/overlay/Modal":{Modal:({children})=>children},"@/components/overlay/ConfirmDialog":{ConfirmDialog:()=>null},"./AdminDraftGuard":{useAdminDraftProtection(){}}};
    operationModules["./AdminShell"]={...modules["./AdminShell"],useAdminShell:()=>({setMutationBusy(){}})};
    modules["./AdminRemoteOperations"]=compile("../components/admin/AdminRemoteOperations.tsx",operationModules);
    modules["./AdminDraftGuard"]={useAdminDraftGuard:()=>({requestAction:action=>action()})};
    const { AdminRemoteManagement } = compile("../components/admin/AdminRemoteManagement.tsx", modules);
    const html = renderToStaticMarkup(React.createElement(AdminRemoteManagement, {initial:contract.adminRemoteSnapshot(adminRemoteFixture())}));
    assert.ok(html.includes(messages.adminRemoteActions.operationHint)); assert.ok(html.includes(messages.adminRemoteActions.accepted)); assert.ok(!html.includes(messages.adminRemote.operation+" · "+messages.adminRemoteActions.succeeded)); assert.ok(html.includes("127.0.0.1:6711"));
    assert.equal((html.match(/<button/g)||[]).length,7);
    const historyFixture=adminRemoteFixture();
    historyFixture.updates.history=["check","install","rollback","policy","recover"].map(action=>({at:historyFixture.observedAt,action,version:"0.1.39",result:"ok"}));
    historyFixture.updates.history.push({at:historyFixture.observedAt,action:"check",version:"",result:"unknown_<error>"});
    const historyHtml=renderToStaticMarkup(React.createElement(AdminRemoteManagement,{initial:contract.adminRemoteSnapshot(historyFixture)}));
    const escapeText=text=>renderToStaticMarkup(React.createElement("span",null,text)).slice(6,-7);
    for (const action of ["check","install","rollback","policy","recover"]) {
      const label=action==="recover" ? messages.adminRemoteHistory.recover : messages.adminRemoteActions[action];
      assert.ok(historyHtml.includes(`${escapeText(label)} · 0.1.39 · ${escapeText(messages.adminRemoteHistory.ok)}`), `${locale}: ${action}`);
    }
    assert.ok(historyHtml.includes("unknown_&lt;error&gt;"));
    assert.ok(!historyHtml.includes("· ok<"));
    for (const phase of Object.keys(messages.adminRemoteStates).filter(key=>!["integrated","bridge"].includes(key))) {
      const fixture=adminRemoteFixture();fixture.updates.phase=phase;
      const rendered=renderToStaticMarkup(React.createElement(AdminRemoteManagement,{initial:contract.adminRemoteSnapshot(fixture)}));
      assert.ok(rendered.includes(messages.adminRemoteStates[phase]), `${locale}: ${phase}`);
      assert.ok(rendered.includes(messages.adminRemoteStates.integrated));
      assert.ok(!rendered.includes(">not_configured<"));
    }
    const bridge=adminRemoteFixture();bridge.node.role="bridge";bridge.node.primaryApi="https://primary.example.test/";
    assert.ok(renderToStaticMarkup(React.createElement(AdminRemoteManagement,{initial:contract.adminRemoteSnapshot(bridge)})).includes(messages.adminRemoteStates.bridge));
    const unsupported = renderToStaticMarkup(React.createElement(AdminRemoteManagement,{initialError:"unsupported"})); assert.ok(unsupported.includes(messages.adminRemote.unsupported)); assert.ok(!unsupported.includes("6711"));
    const unconfigured = renderToStaticMarkup(React.createElement(AdminRemoteManagement,{initialError:"managementNotConfigured"})); assert.ok(unconfigured.includes(messages.adminRemoteConfiguration.notConfigured)); assert.ok(!unconfigured.includes(messages.adminRemote.unsupported));
  }
});
