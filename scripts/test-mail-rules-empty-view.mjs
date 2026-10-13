import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { parseSimpleMailRule } from "../lib/simple-mail-rule.ts";

const require = createRequire(import.meta.url);
const source = readFileSync("components/settings/LiveMailRules.tsx", "utf8");
const ast = ts.createSourceFile("rules.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let content;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "content") content = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(content);
const compiled = ts.transpileModule(`const content = ${content};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const messages = JSON.parse(readFileSync("messages/ko.json", "utf8"));
const translate = namespace => key => key.split(".").reduce((obj, part) => obj[part], messages[namespace]);
const Button = ({ children, disabled, onClick }) => React.createElement("button", { disabled, onClick }, children);
const Placeholder = () => null;
function render({ embedded = true, drafts = [], dirty = false, status = "ready", saveUncertain = false } = {}) {
  const bindings = {
    embedded, drafts, dirty, status, saveUncertain, applicationLocked: false, setApplicationLocked: () => {}, data: { mode: "legacy", revision: 0, enabled: false, rules: [] },
    title: "메일 규칙", settings: translate("settingsSystem"), live: translate("rulesLive"), designer: translate("ruleDesigner"), service: translate("liveService"),
    saving: false, checking: false, feedback: "", selected: drafts[0] ?? null, checkResult: null, envelopeFrom: "", sampleMessage: "", dateFormat: new Intl.DateTimeFormat("ko"), mailboxes: [], mailboxSummaryStatus: "ready",
    add: () => {}, save: () => {}, move: () => {}, update: () => {}, checkRule: () => {}, setStatus: () => {}, setAttempt: () => {}, parseSimpleMailRule,
    importing: false, importPreview: null, duplicate: () => {}, setDeleteKey: () => {}, setSelectedKey: () => {}, importFile: () => {}, exportFile: () => {},
    MailRuleSidebar: ({ rules }) => React.createElement("nav", { "data-rule-sidebar": true }, React.createElement("button", null, messages.rulesLive.add), rules.map(rule => React.createElement("span", { key: rule.key }, rule.name))),
    Button, SettingsPageIntro: ({ title }) => React.createElement("h1", null, title),
    SystemErrorNotice: ({ message }) => React.createElement("p", { role: "alert" }, message),
    Input: Placeholder, CustomSelect: Placeholder, Switch: Placeholder, MailRuleVisualEditor: Placeholder, MailRuleApplication: Placeholder,
    Plus: Placeholder, ArrowUp: Placeholder, ArrowDown: Placeholder, Trash2: Placeholder,
  };
  const element = new Function("require", "exports", ...Object.keys(bindings), `${compiled};return content;`)(require, {}, ...Object.values(bindings));
  return renderToStaticMarkup(element);
}
const empty = render();
assert.equal(empty.split(messages.rulesLive.empty).length - 1, 1, "only one empty message");
assert.equal(empty.split(messages.rulesLive.add).length - 1, 1, "only one add button");
assert.ok(!empty.includes("<h1"), "accordion does not repeat its heading");
assert.ok(!empty.includes(messages.rulesLive.modeConversion), "conversion confirmation is not persistent page copy");
assert.ok(!empty.includes(messages.rulesLive.saveAll));
assert.ok(empty.includes("<nav"), "empty manager still supports add and import from left sidebar");
assert.ok(!empty.includes("sticky bottom-0"));
assert.ok(render({ dirty: true }).includes(messages.rulesLive.saveAll), "removing final rule retains the save operation");
assert.ok(render({ saveUncertain: true }).includes(messages.rulesLive.reload));
assert.ok(render({ embedded: false }).includes("<h1"));
const populated = render({ drafts: [{ key: "synthetic", id: null, name: "Synthetic", source: "keep;", kind: "filter", enabled: false }] });
assert.ok(populated.includes("<nav"));
assert.ok(!populated.includes(messages.rulesLive.empty));
assert.ok(!populated.includes(messages.rulesLive.saveAll), "unchanged settings do not show a disabled save bar");
assert.ok(render({ status: "loading" }).includes('role="status"'));
assert.match(readFileSync("components/settings/SettingsLanding.tsx", "utf8"), /active === "filters"\) return <div className="p-4 sm:p-7"><LiveMailRules embedded/);
console.log("PASS: actual empty/populated/loading JSX, one CTA/message, no duplicate heading/internal warnings, final deletion and uncertain-save recovery retained");
