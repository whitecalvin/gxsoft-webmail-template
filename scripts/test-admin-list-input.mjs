import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { adminListInputValues } from "../lib/admin-list-input.ts";
import { adminMutationPlan } from "../lib/tastemail/admin-management.ts";

test("actual list editor keeps Enter, blanks and spaces while parent receives normalized values", () => {
  const source = readFileSync(new URL("../components/admin/AdminListInput.tsx", import.meta.url), "utf8");
  let state = null, value = ["first@example.test"], addresses = true;
  const modules = { "react/jsx-runtime": jsx, "react": { useState: () => [state, next => { state = next; }] }, "@/lib/admin-list-input": { adminListInputValues } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => { assert.ok(name in modules); return modules[name]; } });
  const render = () => exports.AdminListInput({ id: "members", disabled: false, required: true, rows: 4, addresses, value, onChange: next => { value = next; } });
  assert.equal(render().props.value, "first@example.test");
  for (const text of ["first@example.test\n", "first@example.test\n\n  ", "first@example.test\n  second@example.test "]) {
    render().props.onChange({ target: { value: text } });
    assert.equal(render().props.value, text);
    assert.deepEqual([...value], adminListInputValues(text, true));
  }
  render().props.onChange({ target: { value: "first@example.test,second@example.test;third@example.test" } });
  assert.equal(value.length, 3);
  value = ["fresh@example.test"];
  assert.equal(render().props.value, "fresh@example.test", "new server value replaces old raw draft");
  addresses = false;
  render().props.onChange({ target: { value: "comma,inside\n\n tail " } });
  assert.deepEqual([...value], ["comma,inside", "tail"]);
  assert.equal(render().props.value, "comma,inside\n\n tail ");
  assert.equal(render().props.required, true);
  assert.equal(render().props.rows, 4);
});

test("groups retain original member bounds and case-insensitive duplicate rejection", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const plan = (members, action = "edit", displayName = "Synthetic QA") => adminMutationPlan({ resource: "groups", action, id, confirmed: true, input: { displayName, enabled: true, members, address: "team@example.test", permissionOnly: true } });
  assert.equal(plan(["first@example.test"]).input.members.length, 1);
  assert.equal(plan(Array.from({ length: 100 }, (_, n) => `qa${n}@example.test`), "create").input.members.length, 100);
  for (const members of [[], ["qa@example.test", "QA@example.test"], Array.from({ length: 101 }, (_, n) => `qa${n}@example.test`), ["a".repeat(321)]]) assert.throws(() => plan(members));
  for (const name of ["a".repeat(201), "team\u200b"]) assert.throws(() => plan(["first@example.test"], "edit", name));
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /<AdminListInput/);
  assert.match(ui, /<AdminListInput[^>]+required=\{resource === "groups" && spec.name === "members"\}/);
  assert.doesNotMatch(ui, /event.target.value.split\("\\n"\).map/);
});
