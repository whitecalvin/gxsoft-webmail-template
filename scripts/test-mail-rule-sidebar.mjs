import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync("components/settings/MailRuleSidebar.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const applicationCode = ts.transpileModule(readFileSync("components/settings/MailRuleApplication.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const parser = {};
new Function("exports", ts.transpileModule(readFileSync("lib/mail-rule-application.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(parser);
for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const exported = {};
  const dependency = name => {
    if (name === "next-intl") return { useTranslations: ns => key => { assert.equal(typeof messages[ns][key], "string", `${locale}:${ns}.${key}`); return messages[ns][key]; } };
    if (name === "@/components/ui/Button") return { Button: ({ children, leadingIcon, size, loading, variant, ...props }) => { void size; void loading; return React.createElement("button", { ...props, "data-variant": variant }, leadingIcon, children); } };
    if (name === "@/components/ui/Input") return { Input: props => React.createElement("input", props) };
    if (name === "@/components/ui/Switch") return { Switch: ({ on, disabled, label }) => React.createElement("button", { disabled, role: "switch", "aria-checked": on, "aria-label": label }) };
    if (name === "@/components/ui/Tooltip") return { Tooltip: ({ content, children }) => React.createElement("span", { "data-tooltip": content }, children) };
    if (name === "@/context/mail-context") return { useMail: () => ({ mailboxes: [], mailboxSummaryStatus: "ready", refreshMailbox() {} }) };
    if (name === "@/lib/mail-rule-application") return parser;
    if (["@/components/ui/CustomSelect", "@/components/overlay/Modal", "@/components/overlay/ConfirmDialog", "@/components/overlay/DialogActions", "@/lib/mailbox-label", "@/lib/tastemail/client-session-status"].includes(name)) return {};
    return require(name);
  };
  new Function("require", "exports", code)(dependency, exported);
  const application = {};
  new Function("require", "exports", applicationCode)(dependency, application);
  const rule = { id: "00000000-0000-0000-0000-000000000004", name: "Synthetic rule" };
  const item = { key: "synthetic", name: "Synthetic rule", kind: "filter", enabled: false };
  const props = { rules: [item], selected: item, disabled: false, checking: false, importing: false,
    onSelect() {}, onAdd() {}, onMove() {}, onCheck() {}, onDuplicate() {}, onDelete() {}, onToggle() {}, onImport() {}, onExport() {},
    renderApplication: () => React.createElement(application.MailRuleApplication, { icon: true, rule, revision: 1, disabled: false, onLock() {} }) };
  const html = renderToStaticMarkup(React.createElement(exported.MailRuleSidebar, props));
  for (const label of [messages.rulesLive.validate, messages.rulesLive.remove, messages.ruleManager.duplicate, messages.ruleManager.import, messages.ruleManager.export, messages.ruleManager.enable]) assert.ok(html.includes(label));
  assert.match(html, /data-rule-tools/);
  assert.match(html, /data-rule-apply/);
  const enabledAction = renderToStaticMarkup(React.createElement(application.MailRuleApplication, { icon: true, rule, revision: 1, disabled: false, onLock() {} }));
  assert.doesNotMatch(enabledAction, /disabled=""/);
  for (const guarded of [{ icon: true, disabled: false }, { icon: true, rule, disabled: true }, { icon: true, rule, disabled: false, triggerDisabled: true }]) {
    const action = renderToStaticMarkup(React.createElement(application.MailRuleApplication, { ...guarded, revision: 1, onLock() {} }));
    assert.match(action, /disabled=""/, "unsaved, inactive and locked apply buttons remain disabled");
  }
  assert.match(html, /data-rule-search-actions/);
  assert.ok(html.includes(`aria-label="${messages.rulesLive.add}" data-variant="ghost"`), "add uses background-free shared hover style");
  assert.match(html, /data-rule-footer/);
  assert.ok(!html.includes("grid-cols-2"), "site-manager footer must not become a button grid");
  assert.equal((html.match(/role="switch"/g) ?? []).length, 1, "one enable control, no redundant power button");
  const footer = html.slice(html.indexOf("data-rule-footer"));
  assert.ok(footer.indexOf(messages.ruleManager.duplicate) < footer.indexOf(messages.rulesLive.remove));
  assert.ok(footer.indexOf(messages.rulesLive.remove) < footer.indexOf(messages.ruleManager.import));
  assert.match(html, /aria-current="true"/);
  assert.match(html, /type="file"/);
  assert.match(html, /role="switch" aria-checked="false"/);
  const empty = renderToStaticMarkup(React.createElement(exported.MailRuleSidebar, { ...props, rules: [], selected: null }));
  assert.ok(empty.includes(messages.ruleManager.import), "empty manager can import");
}
console.log("Rule sidebar: all 10 locales, inspection/duplicate/delete/transfer/toggle tools, selection, and empty import passed.");
