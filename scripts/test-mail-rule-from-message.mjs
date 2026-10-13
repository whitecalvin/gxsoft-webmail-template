import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { mailRuleFromSender } from "../lib/mail-rule-from-message.ts";

const rule = mailRuleFromSender(" sender@example.test ", "Synthetic rule");
assert.equal(rule.id, null);
assert.equal(rule.enabled, false);
assert.equal(rule.kind, "filter");
assert.equal(rule.source, 'if address :is "from" "sender@example.test" {\n  keep;\n}\n');
for (const value of ["", "not-an-address", "a@b@c", "a b@test", "a\r\n@test", "a\0@test", `${"a".repeat(255)}@test`]) assert.equal(mailRuleFromSender(value, "Test"), null);
assert.ok(mailRuleFromSender('a"\\x@example.test', "Test").source.includes('a\\"\\\\x@example.test'));

// Exercise the real successful-load callback: preserve existing rules, seed once,
// respect capacity and never save simply because the context action was clicked.
const editor = readFileSync("components/settings/LiveMailRules.tsx", "utf8");
const ast = ts.createSourceFile("editor.tsx", editor, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isArrowFunction(node) && node.parameters[0]?.name.getText(ast) === "rules") callback = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(callback);
const code = ts.transpileModule(`const load = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const seeded = { current: false };
let drafts, selected, feedback;
const existing = { id: "existing", name: "Existing", source: "keep;", kind: "filter", enabled: true };
const bindings = {
  controller: new AbortController(), sender: "sender@example.test", newRuleName: "Test", seeded, mailRuleFromSender,
  crypto: { randomUUID: () => "draft" }, persistedRules: data => data.rules.map(r => ({ ...r, key: r.id })),
  setData: () => {}, setDrafts: v => { drafts = v; }, setSelectedKey: v => { selected = typeof v === "function" ? v(selected) : v; },
  setFeedback: v => { feedback = v; }, setSaveUncertain: () => {}, saveUncertainRef: { current: false }, setStatus: () => {}, live: key => key,
};
const load = new Function(...Object.keys(bindings), `${code};return load;`)(...Object.values(bindings));
load({ rules: [existing] });
assert.equal(drafts.length, 2);
assert.equal(drafts[0].enabled, true);
assert.equal(drafts[1].enabled, false);
assert.equal(selected, "draft");
assert.equal(feedback, "fromMessageNotice");
load({ rules: [existing] });
assert.equal(drafts.length, 1, "reload does not recreate discarded/uncertain drafts");
seeded.current = false;
load({ rules: Array.from({ length: 50 }, (_, index) => ({ ...existing, id: String(index) })) });
assert.equal(drafts.length, 50);
assert.equal(feedback, "limitReached");
assert.ok(!callback.includes("fetch("));
const list = readFileSync("components/mail/MailList.tsx", "utf8");
assert.match(list, /label: rules\("createFromMessage"\)/);
assert.match(list, /items=\{actionItems\(actionSheetEmail\)\}/);
assert.match(list, /actionItems\(desktopMenuEmail\)\.map/);
assert.match(list, /ruleSender\.account === accountAddress/);
assert.ok(!list.includes("localStorage.setItem"));
console.log("PASS: sender draft escaping/validation, shared desktop/mobile action, account isolation, one-shot seed, 50-rule limit, no automatic write");
