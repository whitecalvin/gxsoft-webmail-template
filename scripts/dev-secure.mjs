import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { secureDevOptions, secureNextEnvironment, runSecureDev } from "./secure-dev-contract.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const options = secureDevOptions(process.argv.slice(2));
  const io = {
    now: Date.now, fetch, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    assertPortFree: port => new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", () => reject(new Error(`Local port ${port} is unavailable; existing processes were not stopped`)));
      server.listen(port, "127.0.0.1", () => server.close(resolve));
    }),
    spawnSsh: args => spawn("ssh", args, { cwd: root, stdio: ["ignore", "inherit", "inherit"], windowsHide: true, shell: false }),
    spawnNext: current => spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), "dev", "--hostname", "127.0.0.1", "--port", String(current.webPort)], {
      cwd: root, env: secureNextEnvironment(current, process.env), stdio: "inherit", windowsHide: true, shell: false,
    }),
    stop: child => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
      if (process.platform === "win32") {
        // Next dev owns a worker child. Kill this invocation's exact tree, not unrelated node/SSH processes.
        const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: "ignore" });
        if (result.status !== 0 && child.exitCode === null) child.kill();
      } else child.kill("SIGTERM");
    },
    ready: () => console.log("Verified SSH API tunnel ready. Development server uses loopback API and isolated .next-secure-dev. Ctrl+C closes both owned processes."),
  };
  process.exitCode = await runSecureDev(options, io, controller.signal);
} catch (error) {
  if (controller.signal.aborted) process.exitCode = 0;
  else { console.error(error.message); process.exitCode = 1; }
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
