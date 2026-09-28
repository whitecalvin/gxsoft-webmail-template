import "server-only";

import { timingSafeEqual, randomUUID } from "node:crypto";
import { access, link, readFile, rm, writeFile } from "node:fs/promises";

export type InitialSetupStatus = "disabled" | "pending" | "queued" | "running" | "error" | "service-error" | "configured";

type SetupPaths = { config: string; request: string; status: string; token: string };

function setupPaths(): SetupPaths | null {
  const { TASTEMAIL_INITIAL_SETUP_CONFIG: config, TASTEMAIL_INITIAL_SETUP_REQUEST: request,
    TASTEMAIL_INITIAL_SETUP_STATUS: status, TASTEMAIL_INITIAL_SETUP_TOKEN: token } = process.env;
  return config && request && status && token ? { config, request, status, token } : null;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function initialSetupStatus(): Promise<InitialSetupStatus> {
  const paths = setupPaths();
  if (!paths) return "disabled";
  const configured = await exists(paths.config);
  let value = "";
  try { value = (await readFile(paths.status, "utf8")).trim(); } catch { /* not started */ }
  if (configured && (value === "service-error" || value === "running")) return value;
  if (configured) return "configured";
  if (await exists(paths.request)) return "queued";
  return value === "running" || value === "error" ? value : "pending";
}

export type InitialSetupInput = {
  setupToken: string; hostname: string; databaseHost: string; databasePort: number;
  databaseUser: string; databaseName: string; databasePassword: string;
  createLocalDatabase: boolean; databaseAdminUser: string; databaseAdminPassword: string;
  adminAddress: string; password: string; passwordConfirmation: string; dkimSelector: string;
  webmailPort: number; webmailListenHost: "127.0.0.1" | "0.0.0.0";
  apiPort: number; apiListenHost: "127.0.0.1" | "0.0.0.0";
  webmailHostname: string; webmailProxyEngine: "auto" | "nginx" | "apache" | "caddy";
  cloudflareApiToken: string; confirmed: boolean;
};

const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/u;
const selectorPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const localHost = (host: string) => ["127.0.0.1", "localhost", "::1"].includes(host);
const servicePort = (port: number) => Number.isInteger(port) && port >= 1024 && port <= 65535;

function validHost(host: string): boolean {
  if (localHost(host) || hostnamePattern.test(host)) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host) && host.split(".").every((part) => Number(part) <= 255);
}

export function validateInitialSetup(input: InitialSetupInput): string | null {
  if (!tokenPattern.test(input.setupToken)) return "invalidToken";
  if (!hostnamePattern.test(input.hostname)) return "invalidHostname";
  if (!validHost(input.databaseHost) || !Number.isInteger(input.databasePort) || input.databasePort < 1 || input.databasePort > 65535 ||
    !identifierPattern.test(input.databaseUser) || !identifierPattern.test(input.databaseName) || input.databasePassword.length > 256) return "invalidDatabase";
  if (!servicePort(input.webmailPort) || !servicePort(input.apiPort) || input.webmailPort === input.apiPort ||
    !["127.0.0.1", "0.0.0.0"].includes(input.webmailListenHost) || !["127.0.0.1", "0.0.0.0"].includes(input.apiListenHost)) return "invalidPorts";
  if (input.createLocalDatabase && (!localHost(input.databaseHost) || !identifierPattern.test(input.databaseAdminUser) || input.databaseAdminPassword.length > 256)) return "invalidDatabaseAdmin";
  if (input.adminAddress.length > 320 || !/^[^@\s]+@[^@\s]+$/u.test(input.adminAddress) || !hostnamePattern.test(input.adminAddress.split("@")[1] ?? "")) return "invalidAdmin";
  if (input.password.length < 12 || input.password.length > 256 || input.password !== input.passwordConfirmation) return "invalidPassword";
  if (!selectorPattern.test(input.dkimSelector)) return "invalidSelector";
  if (input.webmailHostname && !hostnamePattern.test(input.webmailHostname)) return "invalidWebmailHost";
  if (!["auto", "nginx", "apache", "caddy"].includes(input.webmailProxyEngine) || input.cloudflareApiToken.length > 128 ||
    (input.cloudflareApiToken && (!input.webmailHostname || !/^[A-Za-z0-9_-]{20,128}$/u.test(input.cloudflareApiToken)))) return "invalidProxy";
  if (!input.confirmed) return "confirmationRequired";
  return null;
}

function databaseUrl(host: string, port: number, user: string, password: string, database: string): string {
  const url = new URL(`postgresql://${host === "::1" ? "[::1]" : host}:${port}/${database}`);
  url.username = user;
  url.password = password;
  return url.toString();
}

export async function queueInitialSetup(input: InitialSetupInput): Promise<"queued" | "busy" | "configured" | "unauthorized" | "unavailable"> {
  const paths = setupPaths();
  if (!paths) return "unavailable";
  let expected: Buffer;
  try { expected = Buffer.from((await readFile(paths.token, "utf8")).trim(), "utf8"); } catch { return "unavailable"; }
  const supplied = Buffer.from(input.setupToken, "utf8");
  if (expected.length !== 43 || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return "unauthorized";
  if (await exists(paths.config)) return "configured";
  if (await exists(paths.request)) return "busy";

  const encode = (value: string) => Buffer.from(value, "utf8").toString("base64");
  const body = [
    "TASTEMAIL_INITIAL_SETUP_V6",
    `hostname=${encode(input.hostname)}`,
    `database_url=${encode(databaseUrl(input.databaseHost, input.databasePort, input.databaseUser, input.databasePassword, input.databaseName))}`,
    `database_admin_url=${encode(input.createLocalDatabase ? databaseUrl(input.databaseHost, input.databasePort, input.databaseAdminUser, input.databaseAdminPassword, "postgres") : "")}`,
    `admin_address=${encode(input.adminAddress)}`,
    `password=${encode(input.password)}`,
    `dkim_selector=${encode(input.dkimSelector)}`,
    `webmail_hostname=${encode(input.webmailHostname)}`,
    `webmail_proxy_engine=${encode(input.webmailHostname ? input.webmailProxyEngine : "auto")}`,
    `cloudflare_api_token=${encode(input.cloudflareApiToken)}`,
    `webmail_port=${encode(String(input.webmailPort))}`,
    `api_port=${encode(String(input.apiPort))}`,
    `webmail_listen_host=${encode(input.webmailListenHost)}`,
    `api_listen_host=${encode(input.apiListenHost)}`,
    "",
  ].join("\n");
  const temporary = `${paths.request}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rm(paths.status, { force: true });
    await link(temporary, paths.request);
    return "queued";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EEXIST" ? "busy" : "unavailable";
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
