import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => name === 'server-only' ? {} : name in dependencies ? dependencies[name] : require(name));
  return exports;
}
const shortcuts = load('lib/mail-shortcuts.ts');
const user = load('lib/user-settings.ts', { './mail-image-policy': load('lib/mail-image-policy.ts'), './mail-shortcuts': shortcuts });
const contract = load('lib/general-settings.ts', { './user-settings': user, './mail-shortcuts': shortcuts });
const accountId = '12345678-1234-4234-8234-123456789abc';
const before = { version: 1, accountId, revision: 0, settings: contract.generalSettingsFromUser(user.DEFAULT_USER_SETTINGS, 'self@example.test') };
const patch = { expectedRevision: 0, changes: { inbox: { remoteImages: 'never' } } };
const after = structuredClone(before); after.revision = 1; after.settings.inbox.remoteImages = 'never';
let response, transportFailure = false, calls = [];
const server = { serviceStatus: status => status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 429 ? 'rateLimited' : status >= 500 ? 'retryable' : 'unavailable', tastemailRequest: async (...args) => { calls.push(args); if (transportFailure) throw new Error('synthetic transport failure'); return response; } };
const adapter = load('lib/tastemail/general-settings.ts', { './server': server, '../general-settings': contract });
response = Response.json(before);
assert.deepEqual(await adapter.requestGeneralSettings('synthetic-token'), before);
response = Response.json(after);
assert.deepEqual(await adapter.requestGeneralSettings('synthetic-token', patch, accountId), after);
assert.equal(calls.at(-1)[0], '/api/user/general-settings');
assert.equal(calls.at(-1)[2].method, 'PATCH');
assert.deepEqual(JSON.parse(calls.at(-1)[2].body), patch);
for (const [code, type, status] of [[400,'invalidRequest','invalid_request'],[401,'unauthorized','unauthorized'],[403,'forbidden','forbidden'],[404,'notFound','not_deployed'],[413,'tooLarge','invalid_request'],[429,'rateLimit','rateLimited'],[409,'stateMismatch','conflict'],[409,'resultUnknown','mutation_uncertain'],[500,'serverFail','mutation_uncertain'],[503,'serverFail','mutation_uncertain']]) {
  response = Response.json({ type, detail: 'not returned' }, { status: code });
  await assert.rejects(adapter.requestGeneralSettings('synthetic-token', patch), error => error.status === status);
}
for (const invalid of [before, { ...after, accountId: 'aaaaaaaa-1234-4234-8234-123456789abc' }, { ...after, revision: 2 }, { ...after, settings: {} }]) {
  response = Response.json(invalid);
  await assert.rejects(adapter.requestGeneralSettings('synthetic-token', patch, accountId), error => error.status === 'mutation_uncertain');
}
transportFailure = true;
const count = calls.length;
await assert.rejects(adapter.requestGeneralSettings('synthetic-token', patch), error => error.status === 'mutation_uncertain');
assert.equal(calls.length, count + 1, 'never retry a write automatically');
await assert.rejects(adapter.requestGeneralSettings('synthetic-token'), error => error.status === 'retryable');
transportFailure = false;

let token = 'synthetic-token', configured = true, routeCalls = [], routeResult = before, routeError = null;
const route = load('lib/tastemail/general-settings-route.ts', {
  'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
  './contact-route': { sameOrigin: request => request.headers.get('origin') === 'http://localhost:7540' },
  './session': { tastemailSessionToken: async () => token },
  './server': { assertLiveApiConfigured: () => { if (!configured) throw new Error(); } },
  './general-settings': { ...adapter, requestGeneralSettings: async (...args) => { routeCalls.push(args); if (routeError) throw routeError; return args[1] ? after : routeResult; } },
  '../general-settings': contract,
});
const request = body => new Request('http://localhost:7540/api/mail/general-settings', { method: 'PATCH', headers: { origin: 'http://localhost:7540', 'content-type': 'application/json' }, body: JSON.stringify(body) });
let result = await route.generalSettingsRoute();
assert.deepEqual(await result.json(), before); assert.equal(result.headers.get('cache-control'), 'private, no-store');
result = await route.generalSettingsRoute(request(patch));
assert.equal(result.status, 200); assert.equal(routeCalls.at(-1)[2], accountId);
routeCalls = [];
routeResult = after;
assert.equal((await route.generalSettingsRoute(request(patch))).status, 409);
assert.equal(routeCalls.length, 1, 'pre-read conflict must not PATCH');
assert.equal((await route.generalSettingsRoute(request({ ...patch, userId: accountId }))).status, 400);
assert.equal((await route.generalSettingsRoute(new Request('http://localhost:7540/api/mail/general-settings', { method: 'PATCH' }))).status, 403);
token = null; assert.equal((await route.generalSettingsRoute()).status, 401);
token = 'synthetic-token'; configured = false; assert.equal((await route.generalSettingsRoute()).status, 503);
configured = true; routeError = new adapter.GeneralSettingsServiceError('not_deployed'); assert.equal((await route.generalSettingsRoute()).status, 404);
console.log('general-settings service: request, receipt, uncertainty, auth, origin, conflict and no-store checks passed');
