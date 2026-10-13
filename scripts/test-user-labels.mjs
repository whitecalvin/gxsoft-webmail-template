import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as contract from "../lib/user-labels.ts";
import { clientMailFailure } from "../lib/tastemail/client-session-status.ts";

const id = "12345678-1234-4234-8234-123456789abc";
const label = { id, name: "업무", color: "#3366FF", keyword: `label_${id.replaceAll("-", "")}` };
const before = { revision: 1, labels: [label] };
assert.deepEqual(contract.labelFields(" 업무 ", "#aabbcc"), { name: "업무", color: "#AABBCC" });
assert.ok(contract.labelFields("😀".repeat(64), "#3366FF"));
for (const name of ["", " ", "x".repeat(65), "a\0b", "a\u0085b", "a\u202eb", "a\u2066b", "\n업무", "업무\t"]) assert.equal(contract.labelFields(name, "#3366FF"), null);
for (const color of ["red", "#fff", "#GGGGGG", "url(x)"]) assert.equal(contract.labelFields("업무", color), null);
const patch = contract.labelCommand("PATCH", { revision: 1, name: "팀", color: "#3366ff" }, id);
assert.equal(patch.input.color, "#3366FF");
for (const value of [{ revision: -1 }, { revision: 1.2 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { revision: 1, accountId: id }, { revision: 1, name: "업무", color: "#3366FF", userId: id }]) assert.equal(contract.labelCommand("POST", value), null);
assert.equal(contract.labelCommand("DELETE", { revision: 1 }, "../../flags"), null);
assert.equal(contract.labelCommand("DELETE", { revision: 1, name: "업무" }, id), null);
assert.deepEqual(contract.requireUserLabels({ ...before, secret: "must-not-leak" }), before);
for (const value of [{ ...before, labels: [{ ...label, keyword: "$seen" }] }, { ...before, labels: [label, label] }, { ...before, labels: [{ ...label, color: "red" }] }, { ...before, labels: [{ ...label, id: "wrong" }] }, { ...before, deletedId: id }]) assert.throws(() => contract.requireUserLabels(value));
const updated = { revision: 2, labels: [{ ...label, name: "팀" }] };
assert.deepEqual(contract.requireLabelReceipt(updated, patch, before), updated);
assert.equal(contract.requireLabelReceipt(before, { ...patch, input: { ...patch.input, name: label.name } }, before).revision, 1, "no-op PATCH may retain revision");
assert.throws(() => contract.requireLabelReceipt(before, patch, before));
assert.throws(() => contract.requireLabelReceipt({ ...updated, revision: 1 }, patch, before), "changed fields cannot claim a no-op revision");
const deletion = { method: "DELETE", id, input: { revision: 1 } };
assert.deepEqual(contract.requireLabelReceipt({ revision: 2, labels: [], deletedId: id }, deletion, before).labels, []);
assert.throws(() => contract.requireLabelReceipt({ revision: 2, labels: [] }, deletion, before));

const require = createRequire(import.meta.url);
function load(file, dependencies) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", compiled)(exports, name => name === "server-only" ? {} : name in dependencies ? dependencies[name] : require(name));
  return exports;
}
let response = Response.json(before), transportError = false, calls = [];
const server = { serviceStatus: status => status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 429 ? "rateLimited" : status >= 500 ? "retryable" : "unavailable", tastemailRequest: async (...args) => { calls.push(args); if (transportError) throw new Error("synthetic network failure"); return response; } };
const adapter = load("lib/tastemail/labels.ts", { "./server": server, "../user-labels": contract });
assert.deepEqual(await adapter.requestUserLabels("synthetic-token"), before);
response = Response.json(updated);
await adapter.requestUserLabels("synthetic-token", patch);
assert.equal(calls.at(-1)[0], `/api/user/labels/${id}`);
assert.equal(calls.at(-1)[2].method, "PATCH");
assert.deepEqual(JSON.parse(calls.at(-1)[2].body), patch.input);
response = Response.json(before);
await adapter.requestUserLabels("synthetic-token", { method: "POST", input: { revision: 0, name: label.name, color: label.color } });
assert.equal(calls.at(-1)[0], "/api/user/labels");
assert.equal(calls.at(-1)[2].method, "POST");
response = Response.json({ revision: 2, labels: [], deletedId: id });
await adapter.requestUserLabels("synthetic-token", deletion);
assert.equal(calls.at(-1)[2].method, "DELETE");
assert.deepEqual(JSON.parse(calls.at(-1)[2].body), { revision: 1 });
for (const [status, type, expected] of [[409, "duplicateName", "duplicate"], [409, "stateMismatch", "conflict"], [409, "tooManyLabels", "limit"], [404, "notFound", "not_found"], [500, "serverFail", "mutation_uncertain"]]) {
  response = Response.json({ type }, { status });
  await assert.rejects(adapter.requestUserLabels("synthetic-token", patch), error => error.status === expected);
}
response = new Response("not found", { status: 404 });
await assert.rejects(adapter.requestUserLabels("synthetic-token"), error => error.status === "not_deployed");
response = Response.json({ revision: 2, labels: [] });
await assert.rejects(adapter.requestUserLabels("synthetic-token", patch), error => error.status === "mutation_uncertain");
transportError = true;
await assert.rejects(adapter.requestUserLabels("synthetic-token", patch), error => error.status === "mutation_uncertain");
transportError = false;

let token = "synthetic-token", routed = 0;
const route = load("lib/tastemail/label-route.ts", { "next/server": { NextResponse: Response }, "./contact-route": { sameOrigin: request => request.headers.get("origin") === new URL(request.url).origin }, "./session": { tastemailSessionToken: async () => token }, "./server": { assertLiveApiConfigured() {} }, "./labels": { ...adapter, requestUserLabels: async () => { routed++; return before; } }, "../user-labels": contract });
const request = (body, origin = "http://localhost") => new Request("http://localhost/api/mail/labels", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
assert.equal((await route.labelRoute(request({ revision: 1 }, "http://attacker.test"))).status, 403);
token = null; assert.equal((await route.labelRoute()).status, 401); token = "synthetic-token";
assert.equal((await route.labelRoute(request({ revision: 1, userId: id }))).status, 400);
assert.equal((await route.labelRoute(request({ revision: 1, name: "x".repeat(9000), color: "#3366FF" }))).status, 400);
assert.equal(routed, 0);
const result = await route.labelRoute(request({ revision: 1, name: "업무", color: "#3366FF" }));
assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "private, no-store");

const catalogs = JSON.parse(readFileSync("messages/ko.json", "utf8"));
let states, stateIndex, effects = [], uiFetches = 0, stateWrites = [], refs;
const control = ({ children, label, ...props }) => React.createElement("div", null, label, children, props.value !== undefined ? React.createElement("input", { value: props.value, readOnly: true, disabled: props.disabled }) : null);
const ui = load("components/settings/LiveLabelSettings.tsx", {
  react: { ...React, useState: initial => { const index = stateIndex++; return [states[index] === undefined ? initial : states[index], value => stateWrites.push([index, value])]; }, useEffect: fn => { effects.push(fn); }, useRef: value => { const ref = { current: value }; refs.push(ref); return ref; } },
  "next-intl": { useTranslations: namespace => key => key.split(".").reduce((value, part) => value[part], catalogs[namespace]) },
  "@/context/mail-context": { useMail: () => ({ accountAddress: "synthetic@example.test" }) },
  "@/context/toast-context": { useToast: () => ({ success() {}, error() {}, warning() {} }) },
  "@/components/ui/Input": { Input: control }, "@/components/ui/Button": { Button: ({ children, disabled, onClick }) => React.createElement("button", { disabled, onClick }, children) },
  "@/components/overlay/ConfirmDialog": { ConfirmDialog: control }, "@/components/toast/SystemErrorNotice": { SystemErrorNotice: ({ message }) => React.createElement("p", null, message) },
  "@/lib/user-labels": contract, "@/lib/tastemail/client-session-status": { clientMailFailure },
});
function tree(overrides = []) { states = overrides; stateIndex = 0; effects = []; stateWrites = []; refs = []; return ui.LabelSettingsContent(); }
let rendered = renderToStaticMarkup(tree([{ revision: 0, labels: [] }, "ready"]));
assert.ok(rendered.includes(catalogs.labelsLive.empty));
assert.equal(rendered.split(catalogs.settingsSystem.actions.addLabel).length - 1, 1);
rendered = renderToStaticMarkup(tree([before, "ready"]));
assert.ok(rendered.includes(label.name)); assert.ok(!rendered.includes(label.keyword));
assert.ok(renderToStaticMarkup(tree([null, "not_deployed"])).includes(catalogs.labelsLive.notDeployed));
rendered = renderToStaticMarkup(tree([before, "ready", 0, id, true, label.name, label.color, "", false, true]));
assert.ok(rendered.includes(catalogs.labelsLive.uncertain)); assert.ok(rendered.includes('disabled=""'));
function find(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) { const result = find(child, predicate); if (result) return result; }
  return null;
}
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => { uiFetches++; return Response.json({ revision: 2, labels: [{ ...label, name: "팀" }] }); };
const formTree = tree([before, "ready", 0, id, true, "팀", label.color]);
refs[1].current = true; // mounted ref; effects are deliberately not run against a real server.
const form = find(formTree, element => element.type === "form");
form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(uiFetches, 1, "duplicate submit is blocked synchronously");
assert.ok(stateWrites.some(([index, value]) => index === 0 && value.labels?.[0].name === "팀"));
globalThis.fetch = async () => { uiFetches++; throw new Error("synthetic lost response"); };
const lost = tree([before, "ready", 0, id, true, "팀", label.color]); refs[1].current = true;
find(lost, element => element.type === "form").props.onSubmit({ preventDefault() {} });
await new Promise(resolve => setTimeout(resolve, 0));
assert.ok(stateWrites.some(([index, value]) => index === 9 && value === true));
assert.equal(refs[0].current, true, "uncertain save remains locked");
globalThis.fetch = oldFetch;
assert.match(readFileSync("components/settings/SettingsSectionPage.tsx", "utf8"), /labels: LiveLabelSettings/);
console.log("PASS: account label contract, safe metadata receipts, authenticated same-origin routes, synthetic adapter errors, empty/list/not-deployed UI, save race and uncertain-save locks; no live writes");
