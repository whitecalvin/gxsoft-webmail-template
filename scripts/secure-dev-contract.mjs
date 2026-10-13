export function secureDevOptions(args) {
  const options = { host: "192.168.0.109", user: "whitecalvin", sshPort: 22, remotePort: 6711, localPort: 16711, webPort: 7540 };
  const names = { "--ssh-host": "host", "--ssh-user": "user", "--ssh-port": "sshPort", "--remote-api-port": "remotePort", "--local-api-port": "localPort", "--web-port": "webPort" };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const key = names[args[index]];
    if (!key || seen.has(key) || !args[index + 1]) throw new Error("Unknown, duplicate or missing secure-dev option");
    seen.add(key); options[key] = args[index + 1];
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/u.test(options.host) || !/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u.test(options.user)) throw new Error("Invalid SSH host or user");
  for (const key of ["sshPort", "remotePort", "localPort", "webPort"]) {
    if (!/^\d+$/u.test(String(options[key])) || Number(options[key]) < 1 || Number(options[key]) > 65535) throw new Error("Invalid secure-dev port");
    options[key] = Number(options[key]);
  }
  if (options.localPort === options.webPort) throw new Error("API and web ports must differ");
  return options;
}

export function secureSshArgs(options) {
  return ["-N", "-p", String(options.sshPort), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
    "-o", "ExitOnForwardFailure=yes", "-o", "ConnectTimeout=5", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2",
    "-L", `127.0.0.1:${options.localPort}:127.0.0.1:${options.remotePort}`, `${options.user}@${options.host}`];
}

export function secureNextEnvironment(options, existing) {
  // process.env wins over .env files; never rewrite the user's files or expose a NEXT_PUBLIC address.
  return { ...existing, TASTEMAIL_API_URL: `http://127.0.0.1:${options.localPort}`, GXWEBMAIL_BUILD_DIR: ".next-secure-dev" };
}

function watch(child) {
  let done = false;
  const ended = new Promise(resolve => {
    const finish = result => { if (!done) { done = true; resolve(result); } };
    child.once("exit", code => finish({ code }));
    child.once("error", () => finish({ code: 1 }));
  });
  return { ended, get done() { return done; } };
}

export async function runSecureDev(options, io, signal) {
  const owned = [];
  let cancel;
  const cancelled = new Promise(resolve => { cancel = () => resolve(0); });
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    // A occupied listener is never reused: it may point at another server/account database.
    await io.assertPortFree(options.localPort);
    await io.assertPortFree(options.webPort);
    signal.throwIfAborted();
    const ssh = io.spawnSsh(secureSshArgs(options)); owned.push(ssh);
    const sshState = watch(ssh);
    const started = io.now();
    const ready = (async () => {
      while (io.now() - started < 10_000) {
        signal.throwIfAborted();
        if (sshState.done) throw new Error("SSH tunnel exited before readiness");
        try {
          const response = await io.fetch(`http://127.0.0.1:${options.localPort}/health`, {
            redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
          });
          const body = await response.json();
          if (response.ok && body?.status === "ok" && body.service === "tastedev-mail") return;
        } catch { /* Bounded startup probes carry no cookies or authorization. */ }
        await io.sleep(200);
      }
      throw new Error("TASTEMAIL health readiness failed; no development server was started");
    })();
    await Promise.race([ready, sshState.ended.then(() => { throw new Error("SSH tunnel exited before readiness"); }), cancelled.then(() => signal.throwIfAborted())]);
    signal.throwIfAborted();
    const next = io.spawnNext(options); owned.push(next);
    const nextState = watch(next);
    io.ready();
    return await Promise.race([cancelled, nextState.ended.then(result => result.code ?? 1), sshState.ended.then(() => 1)]);
  } finally {
    signal.removeEventListener("abort", cancel);
    // Stop only child handles created by this invocation; never scan/kill a port's owner.
    let cleanupFailed = false;
    for (const child of owned.reverse()) {
      try { await io.stop(child); } catch { cleanupFailed = true; }
    }
    if (cleanupFailed) throw new Error("Owned-process cleanup failed; inspect this invocation's child processes");
  }
}
