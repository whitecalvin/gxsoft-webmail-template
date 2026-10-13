import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync('components/settings/GeneralSettingsStatus.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
let reloads = 0, refreshes = 0, pending = false;
let context = { error: 'retryable', busy: false, uncertain: false, accountAvailable: false, reload: async () => { reloads++; return false; } };
const button = Symbol('button');
const mocks = { react: { useTransition: () => [pending, fn => fn()] }, 'next/navigation': { useRouter: () => ({ refresh: () => { refreshes++; } }) },
  'next-intl': { useTranslations: namespace => key => `${namespace}.${key}` }, '@/context/settings-context': { useSettings: () => context }, '@/components/ui/Button': { Button: button },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, ...props }), jsxs: (type, props) => ({ type, ...props }) } };
const exports = {}; new Function('exports','require',code)(exports, name => { assert.ok(name in mocks, name); return mocks[name]; });
const render = () => exports.GeneralSettingsStatus();
const retry = view => view.children.find(child => child?.type === button);
retry(render()).onClick();
assert.equal(refreshes, 1); assert.equal(reloads, 0, 'unknown account must rerun server initialization, not a no-op GET');
context = { ...context, accountAvailable: true, error: 'not_deployed' };
retry(render()).onClick(); assert.equal(reloads, 1); assert.equal(refreshes, 1, 'known account retries GET only');
context = { ...context, uncertain: true, error: 'mutation_uncertain' };
assert.equal(render().children[0].children, 'generalSettingsStatus.uncertain');
retry(render()).onClick(); assert.equal(reloads, 2); assert.equal(refreshes, 1);
for (const [busy, refreshing] of [[true,false],[false,true]]) {
  context = { ...context, busy }; pending = refreshing;
  const view = render(); assert.equal(retry(view).disabled, true); assert.equal(view.children[0].children, 'liveService.loading');
  retry(view).onClick(); assert.equal(reloads, 2); assert.equal(refreshes, 1);
}
console.log('general settings recovery UI: unknown-account server refresh, known-account GET, uncertain-result GET-only and duplicate guards passed');
