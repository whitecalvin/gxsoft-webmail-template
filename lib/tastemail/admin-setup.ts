import "server-only";
import { loadAdminInitialState } from "./admin-initial";
import { AdminServiceError, loadAdminManagement } from "./admin";
import type { AdminInitialState } from "../admin-initial-state";
import type { AdminSetupStage } from "../admin-setup-navigation";

export async function loadAdminSetup(token: string | null, stage: AdminSetupStage, requestedDomain?: string) {
  const dkim = await loadAdminInitialState("dkim", token, requestedDomain);
  const domain = dkim.management?.dkim?.domain;
  let users: AdminInitialState = { section: "users", error: dkim.error ?? "notFound" };
  if (token && domain && !dkim.error) {
    try { users = { section: "users", error: null, management: await loadAdminManagement(token, "users", new URLSearchParams({ domain })) }; }
    catch (error) { users.error = error instanceof AdminServiceError ? error.status : "unavailable"; }
  }
  const initial = stage === "domain" ? await loadAdminInitialState("domains", token) : stage === "mailbox" ? users : dkim;
  return { initial, dkim, users, domain };
}
