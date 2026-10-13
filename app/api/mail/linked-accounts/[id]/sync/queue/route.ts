import { linkedQueueRoute } from "@/lib/tastemail/linked-sync-queue-route";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return linkedQueueRoute(request, (await context.params).id);
}
