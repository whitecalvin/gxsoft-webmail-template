export function adminAuditQuery(params: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams({ limit: "50" });
  for (const key of ["eventType", "actorUserId", "beforeId"]) {
    const value = params.get(key)?.trim();
    if (!value) continue;
    if (key === "eventType" && !/^[a-z0-9._-]{1,128}$/.test(value)) throw new Error("Invalid audit event");
    if (key === "actorUserId" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Invalid actor");
    if (key === "beforeId" && (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > BigInt("9223372036854775807"))) throw new Error("Invalid audit cursor");
    result.set(key, value);
  }
  return result;
}
