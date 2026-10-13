import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { SETTINGS_NAV } from "../lib/settings-navigation.ts";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
assert.equal(SETTINGS_NAV.find(item => item.key === "filters").href, "/settings/rules");
assert.match(read("app/[locale]/(workspace)/settings/rules/page.tsx"), /return <LiveMailRules \/>/);
assert.match(read("components/settings/LiveAwaySettings.tsx"), /href="\/settings\/rules"/);
for (const path of ["app/[locale]/(workspace)/rules/page.tsx", "app/[locale]/(workspace)/settings/filters/page.tsx"]) {
  const source = read(path), exported = {};
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let destination;
  new Function("require", "exports", js)(name => { assert.equal(name, "next/navigation"); return { redirect: value => { destination = value; } }; }, exported);
  for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
    await exported.default({ params: Promise.resolve({ locale }) });
    assert.equal(destination, `/${locale}/settings/rules`, `${path}:${locale}`);
  }
}
console.log("Rules route: canonical navigation, localized legacy redirects, shared editor and away-settings link passed.");
