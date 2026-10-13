import { linkedOperationRoute } from "@/lib/tastemail/linked-operations-route";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return linkedOperationRoute(request, (await context.params).id);
}
