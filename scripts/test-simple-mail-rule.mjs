import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { EMPTY_SIMPLE_RULE, simpleMailRuleSource, parseSimpleMailRule, simpleRuleMoveReady } from "../lib/simple-mail-rule.ts";
import { mailRuleFromSender } from "../lib/mail-rule-from-message.ts";
import { mailboxLabel } from "../lib/mailbox-label.ts";

for (const sender of ["", "sender@example.test", 'a"\\b@example.test']) for (const subject of ["", '뉴스 "event" \\']) for (const action of ["keep", "read", "star"]) for (const stop of [false, true]) {
  const rule = { sender, subject, action, stop };
  const source = simpleMailRuleSource(rule);
  assert.deepEqual(parseSimpleMailRule(source), rule);
  assert.equal(source.includes('require "imap4flags";'), action !== "keep");
  assert.equal(source.includes("stop;"), stop);
  if (sender && subject) assert.ok(source.includes("if allof ("));
}
assert.deepEqual(parseSimpleMailRule("keep;"), EMPTY_SIMPLE_RULE);
assert.equal(parseSimpleMailRule(mailRuleFromSender("sender@example.test", "Synthetic").source).sender, "sender@example.test");
for (const source of ['require "fileinto"; fileinto "Archive";', 'discard;', 'keep;\ndiscard;', simpleMailRuleSource(EMPTY_SIMPLE_RULE) + 'discard;', '# gxwebmail-filter-v1 {}\nkeep;\n']) assert.equal(parseSimpleMailRule(source), null, "unknown or modified source must remain untouched");
for (const patch of [{ sender: "x\r\n@test" }, { subject: "a\0b" }, { subject: "x".repeat(999) }, { action: "discard" }, { stop: 1 }]) assert.throws(() => simpleMailRuleSource({ ...EMPTY_SIMPLE_RULE, ...patch }));
const read = simpleMailRuleSource({ ...EMPTY_SIMPLE_RULE, action: "read" });
assert.ok(read.includes('addflag "\\\\Seen";'));
assert.ok(read.includes("keep;"));
for (const mailbox of ["Archive", "뉴스/업무", 'A"\\B']) for (const sender of ["", "sender@example.test"]) for (const stop of [true, false]) {
  const rule = { ...EMPTY_SIMPLE_RULE, action: "move", mailbox, sender, stop };
  const source = simpleMailRuleSource(rule);
  assert.deepEqual(parseSimpleMailRule(source), rule);
  assert.ok(source.includes('require "fileinto";'));
  assert.ok(!source.includes("keep;"), "move must not explicitly keep an inbox copy");
  assert.equal(simpleRuleMoveReady(source, [mailbox]), true);
  assert.equal(simpleRuleMoveReady(source, []), false);
  assert.equal(parseSimpleMailRule(source.replace('fileinto ', 'fileinto :copy ')), null);
}
for (const mailbox of [undefined, "", " ", "a\r\nb", "a\0b", "x".repeat(256)]) assert.throws(() => simpleMailRuleSource({ ...EMPTY_SIMPLE_RULE, action: "move", mailbox }));
assert.equal(simpleRuleMoveReady("keep;", []), true);

// Render the real visual editor using only synthetic mail and translated labels.
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync("components/settings/MailRuleVisualEditor.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const messages = JSON.parse(readFileSync("messages/ko.json", "utf8")).ruleDesigner;
const exports = {};
const changeEvents = [];
new Function("exports", "require", compiled)(exports, name => {
  if (name === "next-intl") return { useTranslations: namespace => key => namespace === "sidebar" ? JSON.parse(readFileSync("messages/ko.json", "utf8")).sidebar[key] : messages[key] };
  if (name === "@/lib/mailbox-label") return { mailboxLabel };
  if (name === "@/lib/simple-mail-rule") return { parseSimpleMailRule, simpleMailRuleSource };
  if (name === "@/components/ui/Input") return { Input: ({ label, ...props }) => React.createElement("label", null, label, React.createElement("input", props)) };
  if (name === "@/components/ui/CustomSelect") return { CustomSelect: props => React.createElement("div", null, React.createElement("button", { disabled: props.disabled, "aria-label": props["aria-label"], className: props.className }), props.children) };
  if (name === "@/components/ui/Switch") return { Switch: ({ disabled, label }) => React.createElement("button", { disabled, "aria-label": label }) };
  return require(name);
});
const mailboxes = [{ id: "synthetic-archive", name: "Archive", role: "archive" }, { id: "synthetic-news", name: "뉴스/업무", role: null }];
const render = (source, disabled = false, ready = true) => renderToStaticMarkup(React.createElement(exports.MailRuleVisualEditor, { source, disabled, mailboxes, mailboxesReady: ready, onChange: value => changeEvents.push(value) }));
const empty = render("keep;");
assert.ok(empty.includes(messages.allMessages));
assert.ok(empty.includes(messages.conditions));
assert.ok(empty.includes(messages.action));
assert.ok(render("keep;", true).includes('disabled=""'));
assert.ok(render('discard;').includes(messages.advancedNotice));
assert.equal(changeEvents.length, 0, "rendering never converts or saves source");
const moveSource = simpleMailRuleSource({ ...EMPTY_SIMPLE_RULE, action: "move", mailbox: "Archive", stop: true });
assert.ok(render(moveSource).includes(messages.destination));
assert.match(render(moveSource), /value="Archive">보관함<\/option>/, "display matches sidebar while server value stays unchanged");
assert.ok(render(moveSource).includes("뉴스/업무"));
assert.ok(render(moveSource, false, false).includes(messages.destinationUnavailable));
assert.ok(render(simpleMailRuleSource({ ...EMPTY_SIMPLE_RULE, action: "move", mailbox: "Deleted" })).includes(messages.destinationUnavailable));
function findSelect(node, label) {
  if (!React.isValidElement(node)) return null;
  if (node.props["aria-label"] === label && node.props.onChange) return node;
  for (const child of React.Children.toArray(node.props.children)) { const found = findSelect(child, label); if (found) return found; }
  return null;
}
const tree = source => exports.MailRuleVisualEditor({ source, mailboxes, mailboxesReady: true, onChange: value => changeEvents.push(value) });
findSelect(tree("keep;"), messages.action).props.onChange({ target: { value: "move" } });
assert.deepEqual(parseSimpleMailRule(changeEvents.at(-1)), { ...EMPTY_SIMPLE_RULE, action: "move", mailbox: "Archive", stop: true });
findSelect(tree(moveSource), messages.destination).props.onChange({ target: { value: "ニュース/業務" } });
assert.equal(changeEvents.length, 1, "unknown destination never writes a draft");
findSelect(tree(moveSource), messages.destination).props.onChange({ target: { value: "뉴스/업무" } });
assert.equal(parseSimpleMailRule(changeEvents.at(-1)).mailbox, "뉴스/업무");
findSelect(tree(moveSource), messages.action).props.onChange({ target: { value: "read" } });
assert.equal(parseSimpleMailRule(changeEvents.at(-1)).mailbox, undefined, "changing action clears the target while preserving v1 format");
const editor = readFileSync("components/settings/LiveMailRules.tsx", "utf8");
assert.match(editor, /<MailRuleVisualEditor/);
assert.match(editor, /sticky bottom-0/);
assert.match(editor, /open=\{selected.kind !== "filter" \|\| !parseSimpleMailRule/);
assert.ok(editor.indexOf("!simpleRuleMoveReady") < editor.indexOf('method: "PUT"'), "target verification precedes a save");
console.log("PASS: visual rule round trips, move destinations/escaping/no-inbox-copy, backward compatibility, missing-target save guard, synthetic UI selection and disabled states");
