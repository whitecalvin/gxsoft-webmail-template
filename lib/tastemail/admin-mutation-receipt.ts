import type { adminMutationPlan } from "./admin-management";
type Plan = ReturnType<typeof adminMutationPlan>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid receipt"); return value as Record<string, unknown>; }
function identifier(value: unknown) { if (typeof value !== "string" || !uuid.test(value)) throw new Error("Invalid receipt ID"); return value; }
/** A successful HTTP status alone is not a mutation receipt. Return only UI-safe fields. */
export function adminMutationReceipt(plan: Plan, status: number, value?: unknown) {
  const path = plan.path.split("?")[0];
  const identityChange = /^\/api\/admin\/users\/[0-9a-f-]{36}\/(?:password|address)$/i.test(path);
  if (status === 204) {
    if (plan.method !== "DELETE" || !/^\/api\/admin\/(?:domains|users|aliases|forwarding|groups|api-keys|webhooks)\/[0-9a-f-]{36}$/i.test(path) && !/^\/api\/admin\/themes\/domains\/[0-9a-f-]{36}$/i.test(path)) throw new Error("Missing receipt");
    return { status: "updated" };
  }
  if (status !== 200 && status !== 201) throw new Error("Unexpected mutation status");
  const receipt = object(value);
  if (typeof plan.input.expectedRevision === "number") {
    const revision = receipt.revision;
    if (!Number.isSafeInteger(revision) || revision !== plan.input.expectedRevision + 1) throw new Error("Invalid revision receipt");
  }
  const target = path.match(/^\/api\/admin\/(?:domains|users|groups|queue|webhooks|themes\/packages)\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
  if (target && identifier(receipt.id).toLowerCase() !== target.toLowerCase()) throw new Error("Mismatched target");
  const queueAction = path.match(/^\/api\/admin\/queue\/[0-9a-f-]{36}\/(retry|cancel)$/i)?.[1];
  if (queueAction) {
    const timestamp = queueAction === "retry" ? receipt.nextAttemptAt : receipt.cancelledAt;
    if (!["pending", "deferred"].includes(String(receipt.previousStatus)) || typeof timestamp !== "string" || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) throw new Error("Invalid queue receipt");
  }
  const domain = path.match(/^\/api\/admin\/themes\/domains\/([0-9a-f-]{36})$/i)?.[1];
  if (domain && identifier(receipt.domainId).toLowerCase() !== domain.toLowerCase()) throw new Error("Mismatched domain");
  if (plan.method === "POST" && /^\/api\/admin\/(domains|users|aliases|forwarding|groups|dkim|backup-evidence)$/.test(path)) identifier(receipt.id);
  if (/^\/api\/admin\/dkim\/[^/]+\/activate$/.test(path)) identifier(receipt.id);
  if (path.startsWith("/api/admin/license") && (typeof receipt.status !== "string" || !receipt.status || receipt.status.length > 100)) throw new Error("Invalid license receipt");
  let secret: string | undefined;
  if (path === "/api/admin/api-keys" && plan.method === "POST") {
    identifier(object(receipt.key).id);
    if (typeof receipt.token !== "string" || !/^tmk_[A-Za-z0-9_-]{43}$/.test(receipt.token)) throw new Error("Invalid key receipt");
    secret = receipt.token;
  }
  if (path === "/api/admin/webhooks" && plan.method === "POST") {
    identifier(object(receipt.webhook).id);
    if (typeof receipt.signingSecret !== "string" || !receipt.signingSecret || receipt.signingSecret.length > 256) throw new Error("Invalid webhook receipt");
    secret = receipt.signingSecret;
  }
  if (identityChange && typeof receipt.currentSessionRevoked !== "boolean") throw new Error("Invalid session receipt");
  return { status: "updated", currentSessionRevoked: identityChange && receipt.currentSessionRevoked === true, ...(secret ? { secret } : {}) };
}
