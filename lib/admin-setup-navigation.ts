export const adminSetupStages = ["domain", "dkim", "dns", "mailbox", "verify"] as const;
export type AdminSetupStage = typeof adminSetupStages[number];

export function adminSetupStage(value: unknown): AdminSetupStage {
  return typeof value === "string" && adminSetupStages.includes(value as AdminSetupStage) ? value as AdminSetupStage : "domain";
}

/** Query carry-over only; the DKIM loader still resolves against active server domains. */
export function adminSetupDomain(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim().toLowerCase().replace(/\.$/, "");
  return name.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(name) ? name : undefined;
}

export function adminSetupHref(stage: AdminSetupStage, domain?: string): string {
  const query = new URLSearchParams({ stage });
  if (domain) query.set("domain", domain);
  return `/admin/onboarding?${query}`;
}
