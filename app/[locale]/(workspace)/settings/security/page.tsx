import { LiveSecurity } from "@/components/settings/LiveSecurity";
import { initialLiveSecurity } from "@/lib/tastemail/security-initial";

export default async function Page() {
  return <LiveSecurity initial={await initialLiveSecurity()} />;
}
