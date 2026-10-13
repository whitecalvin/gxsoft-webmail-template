import type { AdminDataset } from "./tastemail/admin-management";
import type { AdminOverview } from "./tastemail/admin-contract";
import type { AdminSetupStage } from "./admin-setup-navigation";

export function adminSetupReadiness(domain: string | undefined, dkim: AdminDataset | undefined, users: AdminDataset | undefined, operations: AdminOverview): Record<AdminSetupStage, boolean | null> {
  const matching = !!domain && dkim?.dkim?.domain.toLowerCase() === domain.toLowerCase();
  const keys = matching ? dkim.items : undefined;
  const records = matching ? dkim.dkim!.records.filter(record => record.recordType !== "PTR") : undefined;
  // 빈 레코드 목록의 every()를 성공으로 간주하지 않습니다.
  const dns = records ? records.some(record => record.recordType === "MX") && records.some(record => record.recordType === "TXT" && /^v=spf1(?:\s|$)/i.test(record.value)) && records.some(record => record.recordType === "TXT" && /^v=DMARC1(?:;|\s|$)/i.test(record.value)) && records.every(record => record.status === "published") && keys!.some(key => key.status === "active" && key.dnsStatus === "published") : null;
  const mailbox = users && domain ? users.items.some(user => typeof user.address === "string" && user.address.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) : null;
  return {
    domain: !!domain,
    dkim: keys ? keys.some(key => key.status !== "retired") : null,
    dns,
    mailbox,
    verify: operations.database.status === "connected" && operations.database.schemaStatus === "current" && operations.certificate.status === "valid" && operations.listeners.length > 0 && operations.listeners.every(listener => listener.status === "configured"),
  };
}
