import { AdminGmailOAuth } from "@/components/admin/AdminGmailOAuth";
import { GmailOAuthAdminError, loadGmailOAuthSettings } from "@/lib/tastemail/admin-gmail-oauth";
import { tastemailSessionToken } from "@/lib/tastemail/session";
export default async function Page() {
  const token = await tastemailSessionToken();
  if (!token) return <AdminGmailOAuth initialError="unauthorized" />;
  let initial, initialError;
  try { initial = await loadGmailOAuthSettings(token); }
  catch (e) { initialError = e instanceof GmailOAuthAdminError ? e.status : "unavailable"; }
  return <AdminGmailOAuth initial={initial} initialError={initialError} />;
}
