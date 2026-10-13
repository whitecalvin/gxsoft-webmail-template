import "server-only";
import { tastemailRequest } from "./server";

/** Presentation only: admin pages and mutations still enforce server authorization. */
export async function canAccessAdmin(token: string): Promise<boolean> {
  try {
    const response = await tastemailRequest("/api/admin/users?limit=1", token, {
      signal: AbortSignal.timeout(5_000),
    });
    const allowed = response.status === 200;
    await response.body?.cancel();
    return allowed;
  } catch {
    return false;
  }
}
