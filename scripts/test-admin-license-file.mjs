import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { adminLicenseFileText } from "../lib/tastemail/admin-management.ts";

function compile(path, modules) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, Number, Error, require: key => { assert.ok(key in modules, key); return modules[key]; } });
  return exports;
}
const { readAdminLicenseFile } = compile("../lib/admin-license-file.ts", { "./tastemail/admin-management": { adminLicenseFileText } });

test("license file is bounded before reading and validated by UTF-8 content", async () => {
  for (const size of [0, 8193, -1, NaN, 0.5]) await assert.rejects(readAdminLicenseFile({ size, text: () => { assert.fail("oversize file must not be read"); } }));
  assert.equal(await readAdminLicenseFile({ size: 8192, text: async () => "a".repeat(8192) }), "a".repeat(8192));
  assert.equal(await readAdminLicenseFile({ size: 10, text: async () => " \nlicense\n " }), "license");
  for (const text of [" \n", "가".repeat(3000)]) await assert.rejects(readAdminLicenseFile({ size: 1, text: async () => text }));
  await assert.rejects(readAdminLicenseFile({ size: 1, text: async () => { throw new Error("read failed"); } }));
});

test("actual picker resets approval content, blocks races and ignores late unmounted reads", async () => {
  let cleanup, refs = [], index = 0, values = [], errors = 0, busyValues = [];
  const { AdminLicenseFilePicker } = compile("../components/admin/AdminLicenseFilePicker.tsx", {
    "react/jsx-runtime": jsx,
    react: { useRef: value => refs[index++] ?? (refs[index - 1] = { current: value }), useEffect: cb => { cleanup = cb(); } },
    "next-intl": { useTranslations: () => key => key },
    "@/components/ui/Button": { Button: "button" }, "@/lib/admin-license-file": { readAdminLicenseFile },
  });
  const render = disabled => { index = 0; return AdminLicenseFilePicker({ disabled, onValue: value => values.push(value), onError: () => errors++, onBusyChange: value => busyValues.push(value) }).props.children[0]; };
  const event = file => ({ target: { files: file ? [file] : [], value: "C:\\fakepath\\synthetic.license" } });
  let resolve;
  const first = event({ size: 1, text: () => new Promise(done => { resolve = done; }) });
  const pending = render(false).props.onChange(first);
  assert.equal(first.target.value, ""); assert.deepEqual(values, [""]);
  await render(false).props.onChange(event({ size: 1, text: async () => "wrong" }));
  resolve("valid"); await pending;
  assert.deepEqual(values, ["", "valid"]); assert.deepEqual(busyValues, [true, false]);
  await render(false).props.onChange(event({ size: 8193, text: () => assert.fail() }));
  assert.equal(errors, 1); assert.equal(values.at(-1), "");
  const late = render(false).props.onChange(event({ size: 1, text: () => new Promise(done => { resolve = done; }) }));
  cleanup(); resolve("late"); await late; assert.equal(values.at(-1), "");
  const before = values.length;
  await render(true).props.onChange(event({ size: 1, text: async () => "disabled" }));
  await render(false).props.onChange(event(null)); assert.equal(values.length, before);
  const manager = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(manager, /licenseReadInFlight.current \|\| uncertain/);
  assert.match(manager, /useAdminDraftProtection\([^\n]+saving \|\| licenseReading/);
  assert.match(manager, /<fieldset disabled=\{licenseReading\}/);
  assert.match(manager, /current\?\.row === command.row/);
});
