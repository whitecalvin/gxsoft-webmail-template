import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import * as storage from "../lib/admin-storage.ts";

test("binary sizes and quota progress preserve original zero and overflow semantics", () => {
  assert.deepEqual(storage.adminStorageSize(0), { value: 0, unit: "B" });
  assert.deepEqual(storage.adminStorageSize(512 * 1024 ** 2), { value: 512, unit: "MiB" });
  assert.deepEqual(storage.adminStorageSize(10 * 1024 ** 3), { value: 10, unit: "GiB" });
  assert.deepEqual(storage.adminStorageSize(1024 ** 5), { value: 1, unit: "PiB" });
  assert.equal(storage.adminStorageProgress(10, 0), null);
  assert.deepEqual(storage.adminStorageProgress(120, 100), { max: 100, value: 100, exceeded: true });
  assert.deepEqual(storage.adminStorageProgress(0, 100), { max: 100, value: 0, exceeded: false });
  for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => storage.adminStorageSize(value));
});

test("ten catalogs render named accessible capacity and actual over-quota text", () => {
  const source = readFileSync(new URL("../components/admin/AdminStorageUsage.tsx", import.meta.url), "utf8");
  for (const locale of ["ko", "en", "ja", "zh", "zh-hant", "de", "es", "fr", "it", "pt"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const modules = { "react/jsx-runtime": jsx, "@/lib/admin-storage": storage, "next-intl": {
      useTranslations: namespace => key => { assert.equal(typeof messages[namespace][key], "string"); return messages[namespace][key]; },
      useFormatter: () => ({ number: (value, options) => new Intl.NumberFormat(locale, options).format(value) }),
    } };
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => { assert.ok(name in modules, name); return modules[name]; } });
    const render = (usedBytes, quotaBytes) => renderToStaticMarkup(React.createElement(exports.AdminStorageUsage, { name: "Synthetic QA", usedBytes, quotaBytes }));
    const normal = render(512 * 1024 ** 2, 10 * 1024 ** 3);
    assert.match(normal, /512 MiB \/ 10 GiB/); assert.match(normal, /aria-label="Synthetic QA/); assert.match(normal, /aria-valuetext=/); assert.match(normal, /max="10737418240" value="536870912"/);
    const overflow = render(2048, 1024);
    assert.match(overflow, /2 KiB \/ 1 KiB/); assert.match(overflow, /max="1024" value="1024"/); assert.match(overflow, /status-danger/);
    assert.doesNotMatch(render(2048, 0), /<progress/);
  }
  const shared = readFileSync(new URL("../components/admin/AdminSharedMailboxes.tsx", import.meta.url), "utf8");
  assert.match(shared, /<AdminStorageUsage name=\{item.displayName\}/);
  assert.match(shared, /<AdminStorageUsage name=\{detail.mailbox.displayName\}/);
});
