import { NextResponse } from "next/server";
import { adminDeletionReport } from "@/lib/tastemail/admin-deletion-report";
import { assertLiveApiConfigured, serviceStatus, tastemailRequest } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
export const runtime = "nodejs";
const json = (value: object, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return json({ status: "invalid_request" }, 400);
  try { assertLiveApiConfigured(); } catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try {
    const response = await tastemailRequest(`/api/admin/users/${id}/deletion-report`, token);
    if (!response.ok) return json({ status: response.status === 404 ? "notFound" : serviceStatus(response.status) }, [401, 403, 404, 429].includes(response.status) ? response.status : 503);
    return json(adminDeletionReport(await response.json()));
  } catch { return json({ status: "unavailable" }, 503); }
}
