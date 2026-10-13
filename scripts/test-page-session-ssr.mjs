import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { mailboxIconEntry } from '../lib/mailbox-icon-catalog.mjs';
import ts from 'typescript';

const browserMode = process.argv.includes('--browser-fixture');
const generalMode = browserMode || process.argv.includes('--general-settings');
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => { assert.ok(name in dependencies, `unexpected import: ${name}`); return dependencies[name]; });
  return exports;
}
const image = load('lib/mail-image-policy.ts');
const shortcuts = load('lib/mail-shortcuts.ts');
const user = load('lib/user-settings.ts', { './mail-image-policy': image, './mail-shortcuts': shortcuts });
const settingsContract = load('lib/general-settings.ts', { './user-settings': user, './mail-shortcuts': shortcuts });

const mail = 'urn:ietf:params:jmap:mail';
const accounts = {
  'synthetic-a': { id: '12345678-1234-4234-8234-123456789abc', address: 'synthetic-a@example.test', icon: 'emoji:100' },
  'synthetic-b': { id: '23456789-2345-4345-8345-23456789abcd', address: 'synthetic-b@example.test', icon: 'emoji:heart' },
};
const catalogVersion = readFileSync('lib/tastemail/icon-preferences-contract.ts', 'utf8').match(/ICON_CATALOG_VERSION = "([^"]+)"/u)?.[1];
assert.ok(catalogVersion);
const reads = new Map();
const settingsSnapshots = new Map(Object.entries(accounts).map(([token, account]) => {
  const settings = settingsContract.generalSettingsFromUser(user.DEFAULT_USER_SETTINGS, account.address);
  settings.accessibility.fontScale = token === 'synthetic-a' ? '125' : '90';
  settings.accessibility.reduceMotion = token === 'synthetic-a';
  return [token, { version: 1, accountId: account.id, revision: 3, settings }];
}));
let settingsFailure = 0, patchCount = 0;
const api = createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  if (browserMode && request.url === '/api/auth/session' && request.method === 'POST') {
    let raw = ''; for await (const chunk of request) raw += chunk.toString();
    const input = JSON.parse(raw);
    const entry = Object.entries(accounts).find(([, value]) => value.address === input.username);
    if (!entry || input.password !== 'synthetic-only') { response.writeHead(401); response.end('{}'); return; }
    response.end(JSON.stringify({ accessToken: entry[0], expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }));
    return;
  }
  const token = request.headers.authorization?.replace(/^Bearer /u, '');
  const account = accounts[token];
  if (!account) { response.writeHead(401); response.end('{}'); return; }
  if (generalMode && request.url === '/api/user/general-settings') {
    if (settingsFailure) { response.writeHead(settingsFailure); response.end('{}'); return; }
    const current = settingsSnapshots.get(token);
    if (request.method === 'PATCH') {
      patchCount++;
      let raw = ''; for await (const chunk of request) raw += chunk.toString();
      const update = settingsContract.generalSettingsUpdate(JSON.parse(raw));
      assert.ok(update, 'BFF forwards the closed update contract');
      assert.equal(update.expectedRevision, current.revision);
      for (const [section, changes] of Object.entries(update.changes)) Object.assign(current.settings[section], changes);
      current.revision++;
    }
    response.end(JSON.stringify(current)); return;
  }
  if (request.url === '/.well-known/jmap') {
    reads.set(token, (reads.get(token) ?? 0) + 1);
    response.end(JSON.stringify({ apiUrl: '/jmap/api', username: account.address,
      primaryAccounts: { [mail]: account.id }, accounts: { [account.id]: {
        name: account.address, isPersonal: true, accountCapabilities: { [mail]: {} },
      } } }));
    return;
  }
  if (request.url === '/api/user/icon-preferences') {
    response.end(JSON.stringify({ revision: 0, catalogVersion, availableTargets: [{ type: 'profile' }],
      preferences: [{ target: { type: 'profile' }, icon: account.icon }], defaultIcon: 'default', defaultDisplayKind: 'mailbox' }));
    return;
  }
  if (request.url === '/jmap/api' && request.method === 'POST') {
    response.end(JSON.stringify({ methodResponses: [
      ['Mailbox/get', { accountId: account.id, list: [] }, 'mailboxes'],
      ['Email/query', { accountId: account.id, ids: [], position: 0, total: 0 }, 'all-count'],
      ['Email/query', { accountId: account.id, ids: [], position: 0, total: 0 }, 'unread-count'],
    ] }));
    return;
  }
  // 설정 API 미배포 상태를 의도적으로 재현한다. 실제 메일/DB에 접근하지 않는다.
  response.writeHead(request.url === '/api/admin/operations' ? 403 : 404);
  response.end('{}');
});
const listen = server => new Promise(resolveListen => server.listen(0, '127.0.0.1', () => resolveListen(server.address().port)));
const close = server => new Promise(resolveClose => server.close(resolveClose));
let app;
let startup = '', lastStatus = null;
try {
  const apiPort = await listen(api);
  const temporary = createServer(); const webPort = await listen(temporary); await close(temporary);
  const origin = `http://127.0.0.1:${webPort}`;
  app = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '-p', String(webPort)], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GXWEBMAIL_BUILD_DIR: '.next-general-settings-webpack', TASTEMAIL_API_URL: `http://127.0.0.1:${apiPort}` },
  });
  app.stdout.on('data', chunk => { startup = (startup + chunk.toString()).slice(-2000); });
  app.stderr.on('data', chunk => { startup = (startup + chunk.toString()).slice(-2000); });
  let ready = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    assert.equal(app.exitCode, null, 'Next must stay running');
    try { lastStatus = (await fetch(`${origin}/api/mail/session`)).status; if (lastStatus === 401) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, `isolated Next server must start (status=${lastStatus}): ${startup}`);
  if (browserMode) {
    console.log(`BROWSER_FIXTURE ${origin}/ko/login (synthetic-only; send any stdin text to stop)`);
    await new Promise(resolveStop => process.stdin.once('data', resolveStop));
  } else {
  const scenarios = [['synthetic-a', 'ko'], ['synthetic-b', 'ko'], ['synthetic-a', 'ko'],
    ...['en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'zh', 'zh-hant'].map(locale => ['synthetic-a', locale])];
  for (const [token, locale] of scenarios) {
    const before = reads.get(token) ?? 0;
    const response = await fetch(`${origin}/${locale}/settings/locale`, {
      headers: { cookie: `gxwebmail_tastemail_session=${token}` }, redirect: 'manual',
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal((reads.get(token) ?? 0) - before, 1, 'settings, workspace and initial icons share one SSR session lookup');
    assert.ok(html.includes(accounts[token].address), 'SSR must retain the authenticated account');
    const other = token === 'synthetic-a' ? 'synthetic-b' : 'synthetic-a';
    assert.equal(html.includes(accounts[other].address), false, 'SSR must not share another account');
    const rendered = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '');
    assert.ok(rendered.includes(mailboxIconEntry(accounts[token].icon).native), 'profile emoji must be rendered in initial HTML');
    assert.equal(rendered.includes(mailboxIconEntry(accounts[other].icon).native), false, 'other account emoji must not appear in initial HTML');
    if (generalMode) {
      const expected = settingsSnapshots.get(token).settings.accessibility;
      const htmlTag = rendered.match(/<html\b[^>]*>/u)?.[0];
      assert.ok(htmlTag.includes(`--user-font-scale:${Number(expected.fontScale) / 100}`), 'stored font scale must be in first HTML');
      assert.ok(htmlTag.includes(`data-reduce-motion="${expected.reduceMotion}"`), 'stored motion preference must be in first HTML');
      assert.equal(rendered.includes('이 서버에서는 계정별 일반 설정 API를 아직 사용할 수 없습니다.'), false);
    }
  }
  if (generalMode) {
    const token = 'synthetic-a', endpoint = `${origin}/api/mail/general-settings`;
    const headers = { cookie: `gxwebmail_tastemail_session=${token}`, origin, 'content-type': 'application/json' };
    const get = await fetch(endpoint, { headers });
    assert.equal(get.status, 200); assert.equal(get.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await get.json(), settingsSnapshots.get(token));
    const update = { expectedRevision: 3, changes: { accessibility: { fontScale: '110' } } };
    const saved = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify(update) });
    assert.equal(saved.status, 200); assert.equal((await saved.json()).revision, 4); assert.equal(patchCount, 1);
    const stale = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify(update) });
    assert.equal(stale.status, 409); assert.deepEqual(await stale.json(), { status: 'conflict' });
    assert.equal(patchCount, 1, 'stale revision must not reach upstream PATCH');
    const foreign = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ ...update, accountId: accounts['synthetic-b'].id }) });
    assert.equal(foreign.status, 400); assert.equal(patchCount, 1, 'caller must not select another account');
    const csrf = await fetch(endpoint, { method: 'PATCH', headers: { ...headers, origin: 'https://foreign.example.test' }, body: JSON.stringify(update) });
    assert.equal(csrf.status, 403); assert.equal(patchCount, 1);
    const reloaded = await fetch(`${origin}/ko/settings/locale`, { headers });
    assert.ok((await reloaded.text()).match(/<html\b[^>]*>/u)?.[0].includes('--user-font-scale:1.1'), 'saved preference survives a fresh SSR request');
    assert.equal(settingsSnapshots.get('synthetic-b').settings.accessibility.fontScale, '90');
    for (const [http, failure] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'rateLimited'], [503, 'retryable'], [404, 'not_deployed']]) {
      settingsFailure = http;
      const result = await fetch(endpoint, { headers });
      assert.equal(result.status, http); assert.deepEqual(await result.json(), { status: failure });
    }
    settingsFailure = 0;
    const anonymousGet = await fetch(endpoint); assert.equal(anonymousGet.status, 401);
    console.log('general settings production HTTP: seeded SSR, persisted synthetic PATCH, account isolation, conflict, CSRF, closed input and error statuses passed');
  }
  for (const token of ['synthetic-a', 'synthetic-b']) {
    const before = reads.get(token) ?? 0;
    const response = await fetch(`${origin}/api/mail/icon-preferences`, { headers: {
      cookie: `gxwebmail_tastemail_session=${token}`, 'x-gxmail-icon-account': accounts[token].address,
    } });
    assert.equal(response.status, 200);
    assert.equal((reads.get(token) ?? 0) - before, 1, 'API must perform fresh independent authentication');
    assert.equal((await response.json()).preferences[0].icon, accounts[token].icon);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  const anonymous = await fetch(`${origin}/ko/settings/locale`, { redirect: 'manual' });
  assert.equal(anonymous.status, 307); assert.ok(anonymous.headers.get('location')?.endsWith('/ko/login'));
  console.log('production SSR: 10 locales, one shared session lookup, initial profile emojis, account isolation and independent API authentication passed using loopback fixtures');
  }
} finally {
  if (app && app.exitCode === null) {
    app.kill();
    await new Promise(resolveExit => app.once('exit', resolveExit));
  }
  await close(api);
}
