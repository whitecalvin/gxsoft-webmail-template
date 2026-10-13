import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { secureDevOptions, secureSshArgs, secureNextEnvironment, runSecureDev } from "./secure-dev-contract.mjs";

const options = secureDevOptions([]);
assert.deepEqual(options, { host: "192.168.0.109", user: "whitecalvin", sshPort: 22, remotePort: 6711, localPort: 16711, webPort: 7540 });
for (const args of [["--unknown", "x"], ["--web-port"], ["--ssh-host", "-oProxyCommand=x"], ["--ssh-user", "user;command"], ["--web-port", "0"], ["--local-api-port", "65536"], ["--ssh-port", "1.5"], ["--web-port", "16711"], ["--web-port", "17540", "--web-port", "17541"]]) assert.throws(() => secureDevOptions(args));
assert.equal(secureDevOptions(["--web-port", "17540"]).webPort, 17540);
const sshArgs = secureSshArgs(options);
for (const flag of ["BatchMode=yes", "StrictHostKeyChecking=yes", "ExitOnForwardFailure=yes", "127.0.0.1:16711:127.0.0.1:6711"]) assert.ok(sshArgs.includes(flag));
const environment = { TASTEMAIL_API_URL: "http://remote.invalid", EXISTING_SETTING: "synthetic" };
assert.deepEqual(secureNextEnvironment(options, environment), { TASTEMAIL_API_URL: "http://127.0.0.1:16711", EXISTING_SETTING: "synthetic", GXWEBMAIL_BUILD_DIR: ".next-secure-dev" });
assert.equal(environment.TASTEMAIL_API_URL, "http://remote.invalid", "Do not mutate inherited environment object");

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const ssh = new EventEmitter(); const next = new EventEmitter(); const controller = new AbortController();
  const calls = { checked: [], spawned: [], stopped: [], ready: 0, time: 0, fetches: [] };
  const io = {
    assertPortFree: async port => { calls.checked.push(port); },
    now: () => calls.time, sleep: async ms => { calls.time += ms; },
    fetch: async (url, init) => { calls.fetches.push({ url, init }); return Response.json({ status: "ok", service: "tastedev-mail" }); },
    spawnSsh: () => { calls.spawned.push(ssh); return ssh; },
    spawnNext: () => { calls.spawned.push(next); return next; },
    stop: async child => { calls.stopped.push(child); child.emit("exit", 0); },
    ready: () => { calls.ready += 1; },
    ...overrides,
  };
  return { ssh, next, calls, controller, run: () => runSecureDev(options, io, controller.signal) };
}
for (const outcome of ["cancel", "nextExit", "sshExit"]) {
  const f = fixture(); const pending = f.run(); await tick();
  assert.deepEqual(f.calls.checked, [16711, 7540]); assert.equal(f.calls.ready, 1);
  const probe = f.calls.fetches[0]; assert.equal(probe.url, "http://127.0.0.1:16711/health");
  assert.equal(probe.init.redirect, "error"); assert.equal(probe.init.cache, "no-store"); assert.equal(probe.init.headers, undefined);
  if (outcome === "cancel") f.controller.abort();
  else if (outcome === "nextExit") f.next.emit("exit", 7);
  else f.ssh.emit("exit", 0);
  assert.equal(await pending, outcome === "cancel" ? 0 : outcome === "nextExit" ? 7 : 1);
  assert.deepEqual(f.calls.stopped, [f.next, f.ssh]);
}
const occupied = fixture({ assertPortFree: async () => { throw new Error("occupied"); } });
await assert.rejects(occupied.run(), /occupied/u); assert.equal(occupied.calls.spawned.length, 0); assert.equal(occupied.calls.stopped.length, 0);
const unhealthy = fixture({ fetch: async () => Response.json({ status: "ok", service: "other" }) });
await assert.rejects(unhealthy.run(), /health readiness failed/u); assert.deepEqual(unhealthy.calls.spawned, [unhealthy.ssh]); assert.deepEqual(unhealthy.calls.stopped, [unhealthy.ssh]);
const unavailable = fixture({ fetch: async () => { throw new Error("synthetic connection failure"); } });
await assert.rejects(unavailable.run(), /health readiness failed/u); assert.equal(unavailable.calls.ready, 0);
const startup = fixture({ fetch: async () => { startup.controller.abort(); throw new Error("cancelled"); } });
await assert.rejects(startup.run()); assert.deepEqual(startup.calls.spawned, [startup.ssh]); assert.deepEqual(startup.calls.stopped, [startup.ssh]);
const missing = fixture({ spawnSsh: () => { queueMicrotask(() => missing.ssh.emit("error", new Error("not installed"))); return missing.ssh; } });
await assert.rejects(missing.run(), /SSH tunnel exited/u); assert.equal(missing.calls.ready, 0);
const cleanup = fixture({ stop: async child => { cleanup.calls.stopped.push(child); if (child === cleanup.next) throw new Error("synthetic cleanup failure"); } });
const cleanupPending = cleanup.run(); await tick(); cleanup.controller.abort();
await assert.rejects(cleanupPending, /Owned-process cleanup failed/u);
assert.deepEqual(cleanup.calls.stopped, [cleanup.next, cleanup.ssh], "A failed Next cleanup must still attempt SSH cleanup");
console.log("Secure-dev contract passed: strict SSH, loopback-only process environment, occupied ports, health gating, cancellation and owned-child cleanup. Synthetic processes only.");
