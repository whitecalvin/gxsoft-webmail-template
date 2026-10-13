import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync('lib/tastemail/icon-preferences-initial.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
class ServiceError extends Error { constructor(status) { super(status); this.status = status; } }
let status = 'ready', calls = [], failingPreferences = false;
const mocks = {
  'server-only': {},
  './page-session': { pageSessionForToken: async token => {
    calls.push(['session', token]);
    return status === 'ready' ? { status, session: { username: `${token}@example.test` } } : { status };
  } },
  './icon-preferences': {
    IconPreferencesServiceError: ServiceError,
    iconAccountFromSession: session => session.username,
    loadLiveIconPreferences: async token => {
      calls.push(['preferences', token]);
      if (failingPreferences) throw new ServiceError('retryable');
      return { tokenMarker: token };
    },
  },
};
const exports = {};
new Function('exports', 'require', source)(exports, name => { assert.ok(name in mocks); return mocks[name]; });
for (const token of ['synthetic-a', 'synthetic-b']) {
  calls = [];
  assert.deepEqual(await exports.loadInitialAccountIconPreferences(token), {
    account: `${token}@example.test`, preferences: { tokenMarker: token },
  });
  assert.deepEqual(calls, [['session', token], ['preferences', token]]);
}
for (status of ['unauthorized', 'forbidden', 'rateLimited', 'retryable', 'unavailable']) {
  await assert.rejects(exports.loadInitialAccountIconPreferences('synthetic-a'), error => error.status === status);
}
status = 'ready'; failingPreferences = true;
await assert.rejects(exports.loadInitialAccountIconPreferences('synthetic-a'), error => error.status === 'retryable');
const route = readFileSync('lib/tastemail/icon-preferences-route.ts', 'utf8');
assert.ok(route.includes('loadLiveIconAccount(session.token)'));
assert.equal(route.includes('icon-preferences-initial'), false);
console.log('initial icons: same-token session/preferences, account isolation, failure propagation and independent API auth wiring passed');
