import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
const browserMode = process.argv.includes("--browser-fixture");
const buildDir = process.env.GXWEBMAIL_BUILD_DIR ?? ".next-admin-webpack-validation";
assert.match(buildDir, /^\.next-[a-z0-9-]+$/u, "Use only a project-local isolated build directory");
const buildId = readFileSync(resolve(buildDir, "BUILD_ID"), "utf8").trim();
assert.ok(buildId, "An existing successful production build is required");
assert.ok(!browserMode || process.stdin.isTTY, "Browser fixture requires a terminal with open stdin (tty=true)");
const listen = server => new Promise(ok => server.listen(0, "127.0.0.1", () => ok(server.address().port)));
const close = server => new Promise(ok => server.close(ok));
// 고립된 loopback 응답만 사용한다. 실제 인증·메일·DB에 접근하지 않는다.
const api = createServer((_req, res) => { res.writeHead(401, { "content-type": "application/json" }); res.end("{}"); });
let app, startup = "";
try {
  const apiPort = await listen(api);
  const probe = createServer(); const port = await listen(probe); await close(probe);
  const origin = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GXWEBMAIL_BUILD_DIR: buildDir, TASTEMAIL_API_URL: `http://127.0.0.1:${apiPort}` },
  });
  for (const stream of [app.stdout, app.stderr]) stream.on("data", chunk => { startup = (startup + chunk).slice(-1500); });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    assert.equal(app.exitCode, null, startup);
    try { if ((await fetch(`${origin}/ko/login`)).status === 200) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, startup);
  for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
    const response = await fetch(`${origin}/${locale}/login?reason=session-ended`); assert.equal(response.status, 200);
    const html = await response.text();
    const text = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).liveService.unauthorized;
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
    assert.ok(html.match(/<p role="status"[^>]*>[\s\S]*?<\/p>/)?.[0].includes(escaped), `${locale}: initial HTML notice`);
    const normal = await (await fetch(`${origin}/${locale}/login`)).text();
    assert.equal(normal.includes('<p role="status"'), false, `${locale}: anonymous login is not expired`);
  }
  const stale = await (await fetch(`${origin}/ko/login`, { headers: { cookie: "gxwebmail_tastemail_session=synthetic-invalid" } })).text();
  assert.ok(stale.includes('<p role="status"'), "upstream 401 also shows notice without query");
  console.log(`Production HTTP: ten translated initial notices, anonymous distinction and invalid-cookie 401 notice passed; isolated loopback upstream only (BUILD_ID=${buildId}).`);
  if (browserMode) {
    console.log(`BROWSER_FIXTURE ${origin}/ko/login?reason=session-ended`);
    await new Promise(ok => process.stdin.once("data", ok));
  }
} finally {
  if (app?.exitCode === null) { app.kill(); await new Promise(ok => app.once("exit", ok)); }
  await close(api);
}
