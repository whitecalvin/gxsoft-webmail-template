import "server-only";

import { cookies } from "next/headers";

export const TASTEMAIL_SESSION_COOKIE_NAME = "gxwebmail_tastemail_session";

export async function tastemailSessionToken(): Promise<string | null> {
  return (await cookies()).get(TASTEMAIL_SESSION_COOKIE_NAME)?.value ?? null;
}
