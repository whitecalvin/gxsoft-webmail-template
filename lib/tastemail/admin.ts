import "server-only";
import { adminOverview, adminUserQuery, adminUsers } from "./admin-contract";
import { serviceStatus, tastemailRequest } from "./server";
import { type AdminResource, projectAdminDataset } from "./admin-management";
import { adminThemeChoices } from "./admin-theme-catalog";
import { adminAuditQuery } from "./admin-audit-contract";
import { adminQueueQuery } from "./admin-queue-contract";

export class AdminServiceError extends Error {
  constructor(public readonly status: ReturnType<typeof serviceStatus>) { super(status); }
}
export class AdminQueryError extends Error {
  constructor() { super("Invalid administrator query"); }
}
export async function loadAdminManagement(token: string, resource: AdminResource, params: URLSearchParams) {
  if (resource === "dkim") {
    const domain = (params.get("domain") ?? "").trim().toLowerCase().replace(/\.$/, "");
    if (!domain || domain.length > 253 || /\p{Cc}/u.test(domain)) throw new AdminQueryError();
  }
  if (resource === "domain-theme") {
    const id = params.get("domainId") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AdminQueryError();
    const [response, catalog] = await Promise.all([tastemailRequest(`/api/admin/themes/domains/${id}`, token), tastemailRequest("/api/admin/themes", token)]);
    if (!response.ok) throw new AdminServiceError(serviceStatus(response.status));
    if (!catalog.ok) throw new AdminServiceError(serviceStatus(catalog.status));
    try { const data = projectAdminDataset(resource, await response.json()); data.singleton!.id = id; data.themeChoices = adminThemeChoices(await catalog.json()); return data; }
    catch { throw new AdminServiceError("unavailable"); }
  }
  let query = new URLSearchParams({ limit: "50" });
  if (resource === "audit") {
    try { query = adminAuditQuery(params); } catch { throw new AdminQueryError(); }
  }
  if (resource === "queue") {
    try { query = adminQueueQuery(params); } catch { throw new AdminQueryError(); }
  }
  const keys = resource === "users" ? ["q", "afterAddress", "afterId", "domain"] : resource === "queue" ? ["status", "beforePriority", "beforeNextAttemptAt", "beforeCreatedAt", "beforeId"] : resource === "audit" ? ["eventType", "actorUserId", "beforeId"] : resource === "forwarding" ? ["userId"] : ["aliases", "groups", "dkim"].includes(resource) ? ["domain"] : [];
  for (const key of keys) {
    if (resource === "audit" || resource === "queue") break;
    const value = params.get(key)?.trim();
    if (!value) continue;
    if (value.length > 320 || /\p{Cc}/u.test(value)) throw new AdminQueryError();
    if (key === "userId" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AdminQueryError();
    query.set(key, value);
  }
  const productResource = ["api-keys", "webhooks", "backup-evidence", "branding", "reports"].includes(resource);
  const response = await tastemailRequest(`/api/admin/${productResource ? "product" : resource === "theme-packages" ? "themes" : resource}?${query}`, token);
  if (response.status === 400) throw new AdminQueryError();
  if (!response.ok) throw new AdminServiceError(serviceStatus(response.status));
  try { const raw: unknown = await response.json(); const data = projectAdminDataset(resource, raw); if (resource === "themes") data.themeChoices = adminThemeChoices(raw); if (resource === "dkim" && data.dkim?.domain !== (params.get("domain") ?? "").trim().toLowerCase().replace(/\.$/, "")) throw new Error("Mismatched DKIM domain"); return data; }
  catch { throw new AdminServiceError("unavailable"); }
}
export async function loadAdmin(token: string, resource: "operations" | "users", params = new URLSearchParams()) {
  const query = resource === "users" ? `?${adminUserQuery(params)}` : "";
  const response = await tastemailRequest(`/api/admin/${resource}${query}`, token);
  if (!response.ok) throw new AdminServiceError(serviceStatus(response.status));
  try {
    const body: unknown = await response.json();
    return resource === "operations" ? adminOverview(body) : adminUsers(body);
  } catch { throw new AdminServiceError("unavailable"); }
}
