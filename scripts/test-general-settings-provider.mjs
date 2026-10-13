import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, name => name === 'server-only' ? {} : name in dependencies ? dependencies[name] : require(name));
  return exports;
}
const shortcuts = load('lib/mail-shortcuts.ts');
const user = load('lib/user-settings.ts', { './mail-image-policy': load('lib/mail-image-policy.ts'), './mail-shortcuts': shortcuts });
const contract = load('lib/general-settings.ts', { './user-settings': user, './mail-shortcuts': shortcuts });
const state = load('lib/general-settings-state.ts', { './general-settings': contract, './user-settings': user });
const id = '12345678-1234-4234-8234-123456789abc', address = 'self@example.test';
const initial = { version: 1, accountId: id, revision: 7, settings: contract.generalSettingsFromUser(user.DEFAULT_USER_SETTINGS, address) };
initial.settings.inbox.remoteImages = 'never'; initial.settings.inbox.pageSize = '25';
const aliases = { '@/lib/user-settings': user, '@/lib/general-settings': contract, '@/lib/general-settings-state': state };
// Real React server renderer: first HTML uses account settings, without browser globals.
const react = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const actual = load('context/settings-context.tsx', aliases);
function Consumer() {
  const settings = actual.useSettings();
  return react.createElement('p', null, `${settings.hydrated}:${settings.saved.inbox.pageSize}:${settings.saved.inbox.remoteImages}`);
}
assert.equal(renderToStaticMarkup(react.createElement(actual.SettingsProvider, { accountId: id, accountAddress: address, initialSnapshot: initial }, react.createElement(Consumer))), '<p>true:25:never</p>');
assert.equal(renderToStaticMarkup(react.createElement(actual.SettingsProvider, null, react.createElement(Consumer))), '<p>false:50:always</p>');
// Deterministic hook harness exercises callbacks and StrictMode cleanup; not browser hydration proof.
let slots = [], cursor = 0, effects = [];
const fakeReact = { createContext: () => ({ Provider: 'provider' }), useState: fn => { const index = cursor++; if (!(index in slots)) slots[index] = typeof fn === 'function' ? fn() : fn; return [slots[index]]; },
  useRef: value => { const index = cursor++; return slots[index] ??= { current: value }; }, useEffect: fn => effects.push(fn), useMemo: fn => fn(), useCallback: fn => fn,
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useContext: () => null };
const provider = load('context/settings-context.tsx', { ...aliases, react: fakeReact, 'react/jsx-runtime': { jsx: (_type, props) => props } });
const props = { accountId: id, accountAddress: address, initialSnapshot: initial, children: null };
const render = input => { cursor = 0; effects = []; return provider.SettingsProvider(input ?? props).value; };
let context = render();
assert.equal(context.hydrated, true); assert.equal(context.isDirty, false);
assert.equal(context.accountAvailable, true);
context.updateSection('inbox', { pageSize: '100' });
context = render({ ...props, initialSnapshot: { ...initial, revision: 8 } });
assert.equal(context.draft.inbox.pageSize, '100', 'same-account rerender must not overwrite draft');
assert.equal(context.saved.inbox.pageSize, '25'); assert.equal(context.isDirty, true);
let requests = [], fail = false;
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (_url, options) => {
    requests.push(options);
    if (fail) throw new Error('synthetic lost response');
    const body = JSON.parse(options.body);
    const result = structuredClone(initial); result.revision = body.expectedRevision + 1;
    for (const [section, changes] of Object.entries(body.changes)) Object.assign(result.settings[section], changes);
    return Response.json(result);
  };
  assert.equal(await context.save(), true);
  context = render(); assert.equal(context.saved.inbox.pageSize, '100'); assert.equal(context.isDirty, false);
  context.updateSection('locale', { timeFormat: '12' });
  context = render();
  assert.equal(await context.setRemoteImages('always'), false, 'image action must not save unrelated draft');
  assert.equal(requests.length, 1);
  context.discard(); context = render();
  assert.equal(await context.trustImageSender('foreign@example.test', 'sender@example.test'), false);
  fail = true;
  assert.equal(await context.setRemoteImages('always'), false);
  context = render(); assert.equal(context.saved.inbox.remoteImages, 'never'); assert.equal(context.uncertain, true);
  assert.equal(await context.save(), false); context.discard(); context = render(); assert.equal(context.draft.inbox.remoteImages, 'always');
  assert.equal(requests.length, 2);
} finally { globalThis.fetch = originalFetch; }
slots = []; context = render();
const cleanup1 = effects[0](); cleanup1();
render(); const cleanup2 = effects[0]();
await Promise.resolve();
context.updateSection('inbox', { pageSize: '100' }); assert.equal(render().isDirty, true, 'StrictMode setup-cleanup-setup must keep controller alive');
cleanup2(); await Promise.resolve();
context.discard(); context.updateSection('inbox', { pageSize: '50' });
assert.equal(await context.save(), false, 'real unmount prevents late mutations');
slots = []; const unavailable = render({ accountId: id, accountAddress: address, initialSnapshot: null, initialError: 'not_deployed' });
assert.equal(unavailable.hydrated, false); unavailable.updateSection('inbox', { pageSize: '100' }); assert.equal(await unavailable.save(), false);
assert.equal(render({ accountId: id, accountAddress: address }).draft.inbox.pageSize, '50');
slots = []; assert.equal(render({ initialError: 'retryable' }).accountAvailable, false);
const source = readFileSync('context/settings-context.tsx', 'utf8');
assert.doesNotMatch(source, /localStorage|mergeStoredSettings|USER_SETTINGS_STORAGE_KEY/);
const saveBar = readFileSync('components/settings/SettingsPrimitives.tsx', 'utf8');
assert.match(saveBar, /if \(await save\(\)\)/);
assert.match(saveBar, /!hydrated \|\| busy \|\| uncertain/);
const root = readFileSync('app/[locale]/layout.tsx', 'utf8');
assert.match(root, /loadInitialGeneralSettings\(token\)/); assert.match(root, /initialSnapshot=\{generalSettings.snapshot\}/); assert.match(root, /data-high-contrast=\{accessibility\?\.highContrast\}/);
console.log('general settings provider: real SSR HTML, draft preservation, receipt-only save, uncertainty, account boundary, no local fallback and StrictMode lifecycle passed');
