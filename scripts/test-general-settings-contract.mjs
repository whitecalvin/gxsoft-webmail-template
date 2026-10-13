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
const image = load('lib/mail-image-policy.ts');
const shortcuts = load('lib/mail-shortcuts.ts');
const user = load('lib/user-settings.ts', { './mail-image-policy': image, './mail-shortcuts': shortcuts });
const c = load('lib/general-settings.ts', { './user-settings': user, './mail-shortcuts': shortcuts });
const accountId = '12345678-1234-4234-8234-123456789abc';
const settings = c.generalSettingsFromUser(user.DEFAULT_USER_SETTINGS, 'self@example.test');
const snapshot = { version: 1, accountId, revision: 0, settings };
assert.deepEqual(c.requireGeneralSettingsSnapshot(snapshot, accountId), snapshot);
assert.deepEqual(c.userSettingsFromGeneral(snapshot, 'self@example.test'), { ...structuredClone(user.DEFAULT_USER_SETTINGS), inbox: { ...user.DEFAULT_USER_SETTINGS.inbox, remoteImageSenders: { 'self@example.test': [] } } });
for (const change of [ { version: 2 }, { accountId: 'other' }, { revision: -1 }, { revision: 1.1 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { settings: {} } ]) assert.throws(() => c.requireGeneralSettingsSnapshot({ ...snapshot, ...change }));
assert.throws(() => c.requireGeneralSettingsSnapshot(snapshot, 'aaaaaaaa-1234-4234-8234-123456789abc'));
for (const [section, field, value] of [ ['locale','timezone','invalid-zone'], ['locale','timeFormat','25'], ['compose','font','unknown'], ['inbox','remoteImages','all'], ['notifications','quietStart','24:00'], ['sending','defaultCc','not-an-address'], ['accessibility','fontScale','500'], ['shortcuts','bindings',{ ...settings.shortcuts.bindings, reply: 'C' }], ['inbox','remoteImageSenders',['not-email']], ['inbox','remoteImageSenders',{ 'other@example.test': [] }] ]) {
  const bad = structuredClone(snapshot); bad.settings[section][field] = value;
  assert.throws(() => c.requireGeneralSettingsSnapshot(bad), `${section}.${field}`);
}
const bad = structuredClone(snapshot); bad.settings.security = { twoFactor: false };
assert.throws(() => c.requireGeneralSettingsSnapshot(bad));
const patch = { expectedRevision: 0, changes: { inbox: { remoteImages: 'never' } } };
const hidden = structuredClone(snapshot);
hidden.settings.inbox.hiddenSystemMailboxes = ["all", "spam"];
hidden.settings.inbox.hiddenMailboxIds = Array.from({ length: 200 }, (_, i) => `aaaaaaaa-bbbb-4ccc-8ddd-${String(i + 1).padStart(12, "0")}`);
assert.deepEqual(c.requireGeneralSettingsSnapshot(hidden), hidden);
assert.ok(c.generalSettingsUpdate({ expectedRevision: 0, changes: { inbox: { hiddenMailboxIds: hidden.settings.inbox.hiddenMailboxIds } } }));
for (const [field, value] of [["hiddenSystemMailboxes", ["junk"]], ["hiddenSystemMailboxes", ["all", "all"]], ["hiddenMailboxIds", ["00000000-0000-0000-0000-000000000000"]], ["hiddenMailboxIds", ["AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"]], ["hiddenMailboxIds", ["not-id"]]]) {
  const invalid = structuredClone(snapshot); invalid.settings.inbox[field] = value;
  assert.throws(() => c.requireGeneralSettingsSnapshot(invalid));
}
assert.deepEqual(c.generalSettingsUpdate(patch), patch);
assert.deepEqual(c.generalSettingsUpdate({ ...patch, expectedRevision: Number.MAX_SAFE_INTEGER - 1 }), { ...patch, expectedRevision: Number.MAX_SAFE_INTEGER - 1 });
assert.equal(c.generalSettingsUpdate({ ...patch, expectedRevision: Number.MAX_SAFE_INTEGER }), null, 'PATCH must leave room for a safe revision increment');
assert.equal(c.requireGeneralSettingsSnapshot({ ...snapshot, revision: Number.MAX_SAFE_INTEGER }).revision, Number.MAX_SAFE_INTEGER, 'GET may read the terminal safe revision');
const byteLength = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const sized = structuredClone(snapshot);
// Individually valid addresses make the aggregate limit, not a field limit, decisive.
sized.settings.inbox.remoteImageSenders = Array.from({ length: 100 }, (_, i) => `${String(i).padStart(3, '0')}${'x'.repeat(237)}@example.test`);
let remaining = 31744 - byteLength(sized.settings);
assert.ok(remaining > 4096 && remaining <= 8192);
const addressList = length => {
  const count = Math.ceil((length + 2) / 256);
  const characters = length - 2 * (count - 1);
  const base = Math.floor(characters / count);
  return Array.from({ length: count }, (_, i) => {
    const partLength = base + (i < characters % count ? 1 : 0);
    assert.ok(partLength >= 15 && partLength <= 254);
    return `${'x'.repeat(partLength - 13)}@example.test`;
  }).join(', ');
};
sized.settings.sending.defaultCc = addressList(4096);
sized.settings.sending.defaultBcc = addressList(remaining - 4096);
assert.equal(byteLength(sized.settings), 31744);
assert.deepEqual(c.requireGeneralSettingsSnapshot(sized), sized);
sized.settings.compose.defaultSignatureId = 'x';
assert.equal(byteLength(sized.settings), 31745);
assert.throws(() => c.requireGeneralSettingsSnapshot(sized), 'normalized settings over 31744 bytes rejected');
const largePatch = { expectedRevision: 0, changes: { compose: { defaultSignatureId: '' } } };
largePatch.changes.compose.defaultSignatureId = 'x'.repeat(32768 - byteLength(largePatch));
assert.equal(byteLength(largePatch), 32768);
assert.ok(c.generalSettingsUpdate(largePatch), 'shape validator permits the exact request byte limit; server validates field values');
largePatch.changes.compose.defaultSignatureId += 'x';
assert.equal(c.generalSettingsUpdate(largePatch), null);
for (const invalid of [ { ...patch, accountId }, { ...patch, expectedRevision: -1 }, { ...patch, changes: {} }, { ...patch, changes: { inbox: {} } }, { ...patch, changes: { security: {} } }, { ...patch, changes: { inbox: { remoteImages: null } } }, { ...patch, changes: { compose: { signatures: [] } } } ]) assert.equal(c.generalSettingsUpdate(invalid), null);
const isolated = structuredClone(user.DEFAULT_USER_SETTINGS);
isolated.inbox.remoteImageSenders = { 'self@example.test': ['trusted@example.test'], 'other@example.test': ['private@example.test'] };
assert.deepEqual(c.generalSettingsFromUser(isolated, ' SELF@example.test ').inbox.remoteImageSenders, ['trusted@example.test']);
assert.equal('security' in settings, false); assert.equal('signatures' in settings.compose, false);
console.log('general-settings contract: closed schema, account projection, revision and invalid receipt checks passed');
