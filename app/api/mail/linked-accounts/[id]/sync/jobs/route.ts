import { linkedSyncJobsRoute } from "@/lib/tastemail/linked-sync-jobs-route";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return linkedSyncJobsRoute(request, (await context.params).id);
}
