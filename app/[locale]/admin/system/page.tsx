
import { AdminRemoteManagement } from "@/components/admin/AdminRemoteManagement";
import { AdminRemoteError, loadAdminRemote } from "@/lib/tastemail/admin-remote";
import { tastemailSessionToken } from "@/lib/tastemail/session";
export default async function Page() {
  const token = await tastemailSessionToken();
  if (!token) return <AdminRemoteManagement initialError="unauthorized" />;
  let initial, initialError;
  try { initial = await loadAdminRemote(token); }
  catch (error) { initialError = error instanceof AdminRemoteError ? error.status : "unavailable"; }
  return <AdminRemoteManagement initial={initial} initialError={initialError} />;
}
