import "server-only";

import { MailServiceError } from "./mail";
import { serviceStatus, tastemailRequest } from "./server";

export type LiveSharedMailbox = {
  id: string;
  address: string;
  displayName: string;
  usedBytes: number;
  quotaBytes: number;
  rights: { mayRead: boolean; mayWrite: boolean; maySend: boolean; mayManage: boolean };
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function bytes(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function loadLiveSharedMailboxes(token: string): Promise<LiveSharedMailbox[]> {
  const response = await tastemailRequest("/api/shared-mailboxes", token);
  if (!response.ok) throw new MailServiceError(serviceStatus(response.status));
  const payload: unknown = await response.json();
  const rawItems = object(payload)?.items;
  if (!Array.isArray(rawItems) || rawItems.length > 1000) throw new MailServiceError("unavailable");
  return rawItems.map((value) => {
    const item = object(value);
    const rights = object(item?.rights);
    if (
      !item || typeof item.id !== "string" || !item.id ||
      typeof item.address !== "string" || !item.address ||
      typeof item.displayName !== "string" ||
      bytes(item.usedBytes) === null || bytes(item.quotaBytes) === null ||
      !rights || ["mayRead", "mayWrite", "maySend", "mayManage"].some((key) => typeof rights[key] !== "boolean")
    ) throw new MailServiceError("unavailable");
    return {
      id: item.id,
      address: item.address,
      displayName: item.displayName,
      usedBytes: item.usedBytes as number,
      quotaBytes: item.quotaBytes as number,
      rights: rights as LiveSharedMailbox["rights"],
    };
  });
}
