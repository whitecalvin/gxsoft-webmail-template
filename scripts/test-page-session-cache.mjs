import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('lib/tastemail/page-session.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
// 요청 범위를 명시적으로 바꾸는 하네스다. 실제 RSC 캐시 동작 검증은 별도다.
let scope = new Map(), calls = 0, token = 'first', response = () => Response.json({ username: token });
const mocks = {
  'server-only': {},
  react: { cache: fn => (...args) => {
    const key = JSON.stringify(args);
    if (!scope.has(key)) scope.set(key, fn(...args));
    return scope.get(key);
  } },
  'next/navigation': { redirect: url => { throw new Error(`redirect:${url}`); } },
  '@/lib/tastemail/server': { tastemailRequest: async (_path, value) => { calls++; return response(value); } },
  '@/lib/tastemail/session': { tastemailSessionToken: async () => token },
  '@/lib/tastemail/session-contract': { validLiveJmapSession: value => typeof value?.username === 'string' },
};
const exports = {};
new Function('exports', 'require', source)(exports, name => {
  assert.ok(name in mocks, `unexpected import: ${name}`);
  return mocks[name];
});
response = value => Response.json({ username: value });
const [first, repeated] = await Promise.all([exports.pageSessionForToken('first'), exports.pageSessionForToken('first')]);
assert.equal(calls, 1); assert.equal(first, repeated);
assert.equal((await exports.pageSessionForToken('second')).session.username, 'second'); assert.equal(calls, 2);
scope = new Map(); await exports.pageSessionForToken('first'); assert.equal(calls, 3);
for (const [http, status] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'rateLimited'], [408, 'retryable'], [425, 'retryable'], [503, 'retryable'], [404, 'unavailable']]) {
  scope = new Map(); response = () => new Response(null, { status: http });
  assert.deepEqual(await exports.pageSessionForToken('first'), { status });
}
for (const makeResponse of [() => Response.json({}), () => new Response('{broken')]) {
  scope = new Map(); response = makeResponse;
  assert.deepEqual(await exports.pageSessionForToken('first'), { status: 'unavailable' });
}
scope = new Map(); response = () => { throw new Error('network'); };
assert.deepEqual(await exports.pageSessionForToken('first'), { status: 'retryable' });
scope = new Map(); response = () => new Response(null, { status: 401 });
await assert.rejects(exports.livePageSession('ko'), /^Error: redirect:\/ko\/login\?reason=session-ended$/);
token = null; const before = calls;
await assert.rejects(exports.livePageSession('en'), /^Error: redirect:\/en\/login$/); assert.equal(calls, before);
console.log('page session harness: token isolation, request-scope wiring, failure classification and redirect boundary passed (not actual RSC cache proof)');
