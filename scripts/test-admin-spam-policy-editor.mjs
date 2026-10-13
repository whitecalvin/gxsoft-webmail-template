import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { adminSpamPolicyGroups, adminSpamThresholdIssue } from "../lib/admin-spam-policy.ts";
import { adminFieldBounds, managementFields } from "../lib/tastemail/admin-management.ts";
import * as management from "../lib/tastemail/admin-management.ts";
const formExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/admin-form.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: formExports, require: name => { assert.equal(name, "./tastemail/admin-management"); return management; } });
const { adminFieldLabels } = formExports;

function editor(locale = "ko", document = {}) {
  const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const exports = {};
  const modules = { "react/jsx-runtime": jsx, "next-intl": { useTranslations: namespace => createTranslator({ locale, messages, namespace }) },
    "@/components/ui/Button": { Button: props => jsx.jsx("button", { ...props, type: "button" }) },
    "./AdminListInput": { AdminListInput: props => jsx.jsx("textarea", { ...props, value: props.value.join("\n"), onChange() {} }) },
    "@/lib/tastemail/admin-management": { adminFieldBounds, managementFields }, "@/lib/admin-form": { adminFieldLabels },
    "@/lib/admin-spam-policy": { adminSpamPolicyGroups, adminSpamThresholdIssue } };
  const source = readFileSync(new URL("../components/admin/AdminSpamPolicyEditor.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, document, require: name => { assert.ok(name in modules); return modules[name]; } });
  return exports.AdminSpamPolicyEditor;
}
function policy() { return Object.fromEntries(managementFields("spam-policy", "edit").map(field => [field.name, field.type === "boolean" ? true : field.type === "list" ? [] : field.type === "nullableNumber" ? null : field.name === "maxContentScanChars" ? 1024 : 1])); }
function walk(node, predicate) {
  if (!node || typeof node !== "object") return [];
  const children = [node.props?.children].flat(Infinity).flatMap(child => walk(child, predicate));
  return [...(predicate(node) ? [node] : []), ...children];
}

test("grouped editor covers every original field exactly once and retains all ten locales", () => {
  const names = adminSpamPolicyGroups.flatMap(group => [...group.fields]);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), managementFields("spam-policy", "edit").map(field => field.name).sort());
  for (const locale of ["ko", "en", "de", "es", "fr", "it", "ja", "pt", "zh", "zh-hant"]) {
    const component = editor(locale);
    const html = renderToStaticMarkup(component({ input: policy(), disabled: false, showValidation: false, onChange() {} }));
    for (const name of names) assert.equal(html.split(`id="admin-field-${name}"`).length, 2);
    assert.equal((html.match(/<section /g) ?? []).length, 4);
    assert.equal((html.match(/type="number"/g) ?? []).length, 14);
    assert.equal((html.match(/required=""/g) ?? []).length, 12);
    assert.doesNotMatch(html, /MISSING_MESSAGE|title="/);
  }
});

test("threshold feedback matches original nullable thresholds and wrong field", () => {
  const base = policy();
  for (const [patch, field] of [[{ spfSoftfailScore: 2 }, "spfSoftfailScore"], [{ junkThreshold: 5, quarantineThreshold: 4 }, "quarantineThreshold"], [{ junkThreshold: 5, rejectThreshold: 4 }, "rejectThreshold"], [{ quarantineThreshold: 10, rejectThreshold: 9 }, "rejectThreshold"]]) {
    const input = { ...base, ...patch };
    assert.equal(adminSpamThresholdIssue(input).field, field);
    const html = renderToStaticMarkup(editor()({ input, disabled: false, showValidation: true, onChange() {} }));
    assert.match(html, new RegExp(`id="admin-field-${field}"[^>]*aria-invalid="true"`));
    assert.match(html, /role="alert"/);
  }
  for (const value of [null, "", undefined]) assert.equal(adminSpamThresholdIssue({ ...base, junkThreshold: 9, quarantineThreshold: value, rejectThreshold: value }), null);
  assert.equal(adminSpamThresholdIssue({ ...base, quarantineThreshold: "3", rejectThreshold: "3" }), null);
});

test("real field callbacks retain nullable/boolean/list semantics and jumps do not navigate", () => {
  let input = policy(), focus = 0, scroll = 0;
  const component = editor("ko", { getElementById: id => { assert.equal(id, "admin-policy-content"); return { focus: () => focus++, scrollIntoView: () => scroll++ }; } });
  const render = disabled => component({ input, disabled, showValidation: false, onChange: (name, value) => { input = { ...input, [name]: value }; } });
  const field = name => walk(render(false), node => node.props?.id === `admin-field-${name}`)[0];
  field("quarantineThreshold").props.onChange({ target: { value: "" } }); assert.equal(input.quarantineThreshold, null);
  field("junkThreshold").props.onChange({ target: { value: "7" } }); assert.equal(input.junkThreshold, "7");
  field("enabled").props.onChange({ target: { checked: false } }); assert.equal(input.enabled, false);
  field("allowDomains").props.onChange(["example.test"]); assert.deepEqual(input.allowDomains, ["example.test"]);
  assert.doesNotMatch(field("allowDomains").props.className, /app-control/);
  assert.match(field("allowDomains").props.className, /min-h-24/);
  assert.match(field("junkThreshold").props.className, /app-control/);
  walk(render(false), node => node.props?.onClick)[1].props.onClick(); assert.equal(focus, 1); assert.equal(scroll, 1);
  assert.equal(render(true).props.disabled, true);
  const manager = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(manager, /resource !== "spam-policy" && <fieldset/);
  assert.match(manager, /issue\.field.*\?\.focus\(\)/);
  assert.ok(manager.indexOf("<h3 className=\"font-bold\"") < manager.indexOf("<AdminSpamPolicyEditor"), "editor heading precedes controls");
});
