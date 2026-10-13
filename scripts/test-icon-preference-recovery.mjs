import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../components/mail/IconPreferenceRecovery.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
let server, locale = "ko", reads = 0, routeReads = 0;
const pending = { current: false };
const mocks = {
  react: { useRef: () => pending, useState: () => [false, () => {}], useTransition: () => [false, fn => fn()] },
  "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  "next/navigation": { useRouter: () => ({ refresh: () => routeReads++ }) },
  "next-intl": { useTranslations: namespace => (key) => {
    const strings = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    assert.equal(typeof strings[namespace]?.[key], "string", `${locale}: ${namespace}.${key}`);
    return strings[namespace][key];
  } },
  "@/context/mail-context": { useMail: () => ({ accountAddress: "synthetic@test.invalid" }) },
  "@/context/mailbox-icon-context": { useServerMailboxIcons: () => server },
  "@/components/ui/Button": { Button: "Button" },
};
const exported = {};
new Function("require", "exports", compiled)(name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, exported);
const render = () => exported.IconPreferenceRecovery();
server = { required: true, matched: true, status: "ready", refresh: async () => { reads++; return false; } };
assert.equal(render(), null);
for (locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
  for (const status of ["conflict", "uncertain", "unauthorized", "forbidden", "rateLimited", "unavailable", "saving"]) {
    server = { ...server, status };
    const tree = render();
    assert.equal(tree.props.role, "status");
    assert.equal(tree.props["aria-live"], "polite");
    assert.equal(tree.props.children[1].props.disabled, status === "saving");
    assert.equal(tree.props.children[1].props.title, undefined);
    assert.equal(reads, 0, "rendering an error never automatically resubmits or refreshes");
  }
}
let resolve;
server = { ...server, status: "uncertain", refresh: () => { reads++; return new Promise(done => { resolve = done; }); } };
const button = render().props.children[1];
const first = button.props.onClick();
await button.props.onClick();
assert.equal(reads, 1, "pending manual reload cannot be duplicated");
resolve(false); await first;
assert.equal(routeReads, 0, "failed controller read must not trigger a second route request");
assert.equal(pending.current, false);
server = { ...server, matched: false, status: "unavailable", refresh: async () => { reads++; return null; } };
await render().props.children[1].props.onClick();
assert.equal(routeReads, 1, "missing authenticated SSR controller reloads the server route");
server = { ...server, required: false };
assert.equal(render(), null, "legacy local-only callers have no server recovery UI");
console.log("icon recovery: 10 locales, distinct statuses, manual read only, pending lock and SSR recovery passed");
