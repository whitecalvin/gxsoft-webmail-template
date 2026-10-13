import type { AdminSection } from "./admin-navigation";
import type { AdminDkimDomain } from "./admin-dkim-selection";
import type { AdminDataset } from "./tastemail/admin-management";
import type { AdminSharedMailbox } from "./tastemail/admin-shared-contract";
import type { LiveQuarantinePage } from "./tastemail/quarantine";

export type AdminInitialState = {
  section: AdminSection;
  error: string | null;
  management?: AdminDataset;
  dkimDomains?: AdminDkimDomain[];
  shared?: AdminSharedMailbox[];
  quarantine?: LiveQuarantinePage;
};
