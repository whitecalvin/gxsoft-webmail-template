import { linkedSyncRoute } from "@/lib/tastemail/linked-sync-route";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return linkedSyncRoute(request, id);
}
