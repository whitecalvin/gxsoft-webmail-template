export async function requestLiveSignOut(): Promise<boolean> {
  const response = await fetch("/api/mail/session", { method: "DELETE", signal: AbortSignal.timeout(20_000) });
  const payload: unknown = await response.json();
  const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
  if (status === "signed_out" && response.ok) return true;
  if (status === "signout_unconfirmed") return false;
  throw new Error("signout_failed");
}
