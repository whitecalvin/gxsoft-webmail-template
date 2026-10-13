import { linkedAllQueueRoute } from "@/lib/tastemail/linked-sync-all-route";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return linkedAllQueueRoute(request, (await context.params).id);
}
