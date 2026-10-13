import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync('lib/tastemail/general-settings-initial.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const id = '12345678-1234-4234-8234-123456789abc';
let response = { status: 'ready', session: { username: ' SELF@example.test ', primaryAccounts: { mail: id } } }, calls = 0, outcome = { accountId: id };
class ServiceError extends Error { constructor(status) { super(status); this.status = status; } }
const mocks = { 'server-only': {}, './page-session': { pageSessionForToken: async () => { calls++; return response; } },
  './session-contract': { MAIL_CAPABILITY: 'mail', validLiveJmapSession: value => value?.username && value?.primaryAccounts?.mail },
  './general-settings': { GeneralSettingsServiceError: ServiceError, requestGeneralSettings: async (_token, _patch, accountId) => { assert.equal(accountId, id); if (outcome instanceof Error) throw outcome; return outcome; } } };
const exports = {}; new Function('exports', 'require', source)(exports, name => mocks[name]);
assert.deepEqual(await exports.loadInitialGeneralSettings(null), { accountId: null, accountAddress: '', snapshot: null, error: null }); assert.equal(calls, 0);
assert.deepEqual(await exports.loadInitialGeneralSettings('synthetic'), { accountId: id, accountAddress: 'self@example.test', snapshot: outcome, error: null });
for (const status of ['not_deployed', 'unavailable', 'unauthorized', 'retryable']) {
  response = { status: 'ready', session: { username: 'self@example.test', primaryAccounts: { mail: id } } }; outcome = new ServiceError(status);
  const result = await exports.loadInitialGeneralSettings('synthetic'); assert.equal(result.snapshot, null); assert.equal(result.error, status); assert.equal(result.accountId, id);
}
for (const status of ['unauthorized', 'forbidden', 'rateLimited', 'retryable', 'unavailable']) {
  response = { status }; const result = await exports.loadInitialGeneralSettings('synthetic'); assert.equal(result.snapshot, null); assert.equal(result.error, status); assert.equal(result.accountId, null);
}
response = { status: 'ready', session: {} }; assert.equal((await exports.loadInitialGeneralSettings('synthetic')).error, 'unavailable');
console.log('general settings initial: authenticated account projection, unauthenticated skip and explicit failure without default fallback passed');
