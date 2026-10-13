type Method = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
export type EmptyTrashReceipt = { status: "completed" | "partial" | "failed" | "uncertain"; deleted: number; retained: number };
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function parseEmptyTrashReceipt(value: unknown): EmptyTrashReceipt {
  const r = record(value);
  if (!r || !["completed", "partial", "failed", "uncertain"].includes(String(r.status)) ||
      !Number.isSafeInteger(r.deleted) || Number(r.deleted) < 0 || !Number.isSafeInteger(r.retained) || Number(r.retained) < 0 ||
      Number(r.deleted) + Number(r.retained) > 1_000_000 || r.status === "completed" && r.retained !== 0) throw new Error("receipt");
  return { status: r.status as EmptyTrashReceipt["status"], deleted: Number(r.deleted), retained: Number(r.retained) };
}

// 원본 TASTEMAIL과 같이 전체 목록을 고정한 후 100통씩 처리합니다.
export async function emptyTrashSnapshot(accountId: string, mailboxId: string, method: Method): Promise<EmptyTrashReceipt> {
  let deleted = 0, total = 0, writePending = false;
  try {
    const mailboxResult = await method("Mailbox/get", { accountId });
    const trash = Array.isArray(mailboxResult.list) ? mailboxResult.list.map(record).find(item => item?.id === mailboxId) : null;
    if (trash?.role !== "trash" || record(trash.myRights)?.mayRemoveItems !== true) throw new Error("forbidden");
    const ids: string[] = [], seen = new Set<string>();
    let queryState: string | undefined;
    do {
      const query = await method("Email/query", { accountId, filter: { inMailbox: mailboxId }, collapseThreads: false,
        sort: [{ property: "receivedAt", isAscending: false }], position: ids.length, limit: 100, calculateTotal: true });
      if (!Array.isArray(query.ids) || query.ids.length > 100 || typeof query.queryState !== "string" || !query.queryState ||
          !Number.isSafeInteger(query.total) || Number(query.total) < 0 || Number(query.total) > 1_000_000 || query.position !== ids.length ||
          queryState !== undefined && (query.queryState !== queryState || query.total !== total)) throw new Error("snapshot");
      total = Number(query.total); queryState = query.queryState;
      if (!query.ids.length && ids.length < total) throw new Error("incomplete");
      for (const id of query.ids) {
        if (typeof id !== "string" || !id || seen.has(id)) throw new Error("ids");
        seen.add(id); ids.push(id);
      }
      if (ids.length > total) throw new Error("total");
    } while (ids.length < total);
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      const result = await method("Email/get", { accountId, ids: batch, properties: ["id", "mailboxIds"] });
      if (typeof result.state !== "string" || !result.state || !Array.isArray(result.list)) throw new Error("detail");
      const found = new Set<string>(), targets: string[] = [];
      for (const raw of result.list) {
        const item = record(raw), memberships = record(item?.mailboxIds);
        if (!item || typeof item.id !== "string" || !batch.includes(item.id) || found.has(item.id) || !memberships) throw new Error("detail");
        found.add(item.id);
        if (memberships[mailboxId] === true) targets.push(item.id);
      }
      const missing = result.notFound ?? [];
      if (!Array.isArray(missing) || missing.some(id => typeof id !== "string" || !batch.includes(id) || found.has(id)) || new Set(missing).size !== missing.length || found.size + missing.length !== batch.length) throw new Error("incomplete");
      if (!targets.length) continue;
      writePending = true;
      const receipt = await method("Email/set", { accountId, ifInState: result.state, destroy: targets });
      if (!Array.isArray(receipt.destroyed) || receipt.destroyed.some(id => typeof id !== "string" || !targets.includes(id)) || new Set(receipt.destroyed).size !== receipt.destroyed.length) throw new Error("receipt");
      deleted += receipt.destroyed.length;
      writePending = false;
    }
    return { status: deleted === total ? "completed" : "partial", deleted, retained: total - deleted };
  } catch {
    return { status: writePending ? "uncertain" : deleted ? "partial" : "failed", deleted, retained: Math.max(0, total - deleted) };
  }
}
