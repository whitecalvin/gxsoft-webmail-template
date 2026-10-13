import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => name in dependencies ? dependencies[name] : require(name));
  return exports;
}
const shortcuts = load('lib/mail-shortcuts.ts');
const user = load('lib/user-settings.ts', { './mail-image-policy': load('lib/mail-image-policy.ts'), './mail-shortcuts': shortcuts });
const contract = load('lib/general-settings.ts', { './user-settings': user, './mail-shortcuts': shortcuts });
const { GeneralSettingsState, settingsBrowserRequest } = load('lib/general-settings-state.ts', { './general-settings': contract, './user-settings': user });
const id = '12345678-1234-4234-8234-123456789abc';
const before = { version: 1, accountId: id, revision: 0, settings: contract.generalSettingsFromUser(user.DEFAULT_USER_SETTINGS, '') };
const after = structuredClone(before); after.revision = 1; after.settings.inbox.remoteImages = 'never';
const edit = state => state.edit(draft => ({ ...draft, inbox: { ...draft.inbox, remoteImages: 'never' } }));
let pending, calls = [];
const state = new GeneralSettingsState(id, before, input => { calls.push(input); return new Promise(resolve => { pending = resolve; }); });
assert.deepEqual(state.getSnapshot().snapshot, before, 'SSR snapshot starts synchronously');
edit(state);
const saving = state.save();
assert.equal(state.getSnapshot().busy, true);
assert.equal(await state.save(), false); assert.equal(calls.length, 1, 'duplicate submission blocked');
state.edit(draft => ({ ...draft, locale: { ...draft.locale, timeFormat: '12' } }));
pending(after); assert.equal(await saving, true);
assert.equal(state.getSnapshot().snapshot.settings.locale.timeFormat, '24');
assert.equal(state.getSnapshot().draft.locale.timeFormat, '12', 'new edits during save are preserved');
assert.equal(state.getSnapshot().draft.inbox.remoteImages, 'never');
state.discard(); assert.deepEqual(state.getSnapshot().draft, after.settings);

let failure = true, result = after, count = 0;
const uncertain = new GeneralSettingsState(id, before, async input => { count++; if (input && failure) throw new Error('mutation_uncertain'); return result; });
edit(uncertain); assert.equal(await uncertain.save(), false);
assert.equal(uncertain.getSnapshot().uncertain, true); assert.deepEqual(uncertain.getSnapshot().snapshot, before);
assert.equal(await uncertain.save(), false); uncertain.discard(); assert.equal(uncertain.getSnapshot().draft.inbox.remoteImages, 'never'); assert.equal(count, 1);
result = { ...after, accountId: 'aaaaaaaa-1234-4234-8234-123456789abc' };
assert.equal(await uncertain.reload(), false); assert.equal(uncertain.getSnapshot().uncertain, true);
result = after; assert.equal(await uncertain.reload(), true); assert.equal(uncertain.getSnapshot().uncertain, false); assert.deepEqual(uncertain.getSnapshot().snapshot, after);
assert.equal(count, 3, 'recovery GET must not resend');

for (const status of ['unauthorized','forbidden','rateLimited','conflict','invalid_request','not_deployed']) {
  const denied = new GeneralSettingsState(id, before, async () => { throw new Error(status); });
  edit(denied); assert.equal(await denied.save(), false); assert.equal(denied.getSnapshot().error, status); assert.equal(denied.getSnapshot().uncertain, false);
}
const corrupt = new GeneralSettingsState(id, before, async () => ({ ...before, revision: 1 }));
edit(corrupt); assert.equal(await corrupt.save(), false); assert.equal(corrupt.getSnapshot().uncertain, true, 'valid shape and revision alone do not prove applied values');
result = structuredClone(before); result.settings.locale.timeFormat = '12';
const regression = new GeneralSettingsState(id, before, async () => result);
assert.equal(await regression.reload(), false, 'same revision must not change content');
let resolveDisposed;
const disposed = new GeneralSettingsState(id, before, () => new Promise(resolve => { resolveDisposed = resolve; }));
edit(disposed); const old = disposed.save(); disposed.dispose(); resolveDisposed(after); assert.equal(await old, false); assert.deepEqual(disposed.getSnapshot().snapshot, before);
const empty = new GeneralSettingsState(id, null, async () => before, 'not_deployed');
assert.equal(await empty.save(), false); assert.equal(await empty.reload(), true); assert.deepEqual(empty.getSnapshot().snapshot, before);
assert.throws(() => new GeneralSettingsState(null, before));
const invalid = new GeneralSettingsState(id, before, async () => { throw new Error('must not send'); });
invalid.edit(draft => ({ ...draft, locale: { ...draft.locale, timezone: 'invalid-time-zone' } }));
assert.equal(await invalid.save(), false); assert.equal(invalid.getSnapshot().error, 'invalid_request');

const originalFetch = globalThis.fetch;
try {
  let requests = [];
  globalThis.fetch = async (...args) => { requests.push(args); return Response.json({ status: 'mutation_uncertain' }, { status: 502 }); };
  await assert.rejects(settingsBrowserRequest({ expectedRevision: 0, changes: { inbox: { remoteImages: 'never' } } }), /mutation_uncertain/);
  assert.equal(requests.length, 1); assert.equal(requests[0][0], '/api/mail/general-settings'); assert.equal(requests[0][1].credentials, 'same-origin'); assert.equal(requests[0][1].cache, 'no-store');
} finally { globalThis.fetch = originalFetch; }
console.log('general-settings state: SSR seed, duplicate lock, draft preservation, receipt validation, account boundary and GET-only recovery passed');
