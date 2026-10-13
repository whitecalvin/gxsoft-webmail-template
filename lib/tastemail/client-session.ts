let pendingSignOut: Promise<boolean> | null = null;

export function requestLiveSignOut(): Promise<boolean> {
  // Both header and sidebar use this helper, so their local busy flags alone
  // cannot prevent simultaneous revocation requests in the same tab.
  if (pendingSignOut) return pendingSignOut;
  pendingSignOut = (async () => {
    const response = await fetch("/api/mail/session", { method: "DELETE", signal: AbortSignal.timeout(20_000) });
    const payload: unknown = await response.json();
    const status = payload && typeof payload === "object" && !Array.isArray(payload) && "status" in payload ? payload.status : null;
    if (status === "signed_out" && response.ok) return true;
    if (status === "signout_unconfirmed" && response.status === 503) return false;
    throw new Error("signout_failed");
  })().finally(() => { pendingSignOut = null; });
  return pendingSignOut;
}
