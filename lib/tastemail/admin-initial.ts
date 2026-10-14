import "server-only";
import type { AdminInitialState } from "../admin-initial-state";
import type { AdminSection } from "../admin-navigation";
import { adminDkimDomains, adminDkimSelectedDomain } from "../admin-dkim-selection";
import { AdminServiceError, loadAdminManagement } from "./admin";
import { adminSharedList } from "./admin-shared-contract";
import { MailServiceError } from "./mail";
import { loadLiveQuarantinePage } from "./quarantine";
import { serviceStatus, tastemailRequest } from "./server";

export async function loadAdminInitialState(section: Exclude<AdminSection, "dashboard">, token: string | null, requestedDomain?: string): Promise<AdminInitialState> {
  if (!token) return { section, error: "unauthorized" };
  // 도메인 선택이 필수인 화면은 사용자가 대상 선택 전 조회하지 않는다.
  if (section === "domain-theme" || section === "system" || section === "onboarding" || section === "gmail-oauth") return { section, error: null };
  try {
    if (section === "dkim") {
      const response = await tastemailRequest("/api/admin/domains?limit=1000", token);
      if (!response.ok) return { section, error: serviceStatus(response.status) };
      const domains = adminDkimDomains(await response.json());
      const domain = adminDkimSelectedDomain(domains, requestedDomain);
      return { section, error: null, dkimDomains: domains, ...(domain ? { management: await loadAdminManagement(token, "dkim", new URLSearchParams({ domain })) } : {}) };
    }
    if (section === "shared-mailboxes") {
      const response = await tastemailRequest("/api/admin/shared-mailboxes", token);
      if (!response.ok) return { section, error: response.status === 402 ? "licenseLimit" : response.status === 404 ? "notFound" : response.status === 409 ? "conflict" : serviceStatus(response.status) };
      return { section, error: null, shared: adminSharedList(await response.json()).items };
    }
    if (section === "quarantine") return { section, error: null, quarantine: await loadLiveQuarantinePage(token, null, null) };
    return { section, error: null, management: await loadAdminManagement(token, section, new URLSearchParams()) };
  } catch (error) {
    return { section, error: error instanceof AdminServiceError || error instanceof MailServiceError ? error.status : "unavailable" };
  }
}
