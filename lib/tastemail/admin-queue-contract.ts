export function adminQueueQuery(params: URLSearchParams): URLSearchParams {
  const status = params.get("status")?.trim() || "active";
  if (!["active", "pending", "deferred", "in_progress", "delivered", "failed", "cancelled", "all"].includes(status)) throw new Error("Invalid queue status");
  const result = new URLSearchParams({ limit: "50", status });
  const keys = ["beforePriority", "beforeNextAttemptAt", "beforeCreatedAt", "beforeId"];
  if (!keys.some(key => params.has(key))) return result;
  const values = keys.map(key => params.get(key));
  if (values.some(value => !value)) throw new Error("Incomplete queue cursor");
  const [priority, nextAt, createdAt, id] = values as string[];
  if (priority !== "0" && priority !== "1") throw new Error("Invalid queue priority");
  for (const date of [nextAt, createdAt]) if (date.length > 50 || /\p{Cc}/u.test(date) || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error("Invalid queue time");
  if (id.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid queue ID");
  keys.forEach((key, index) => result.set(key, values[index]!));
  return result;
}
