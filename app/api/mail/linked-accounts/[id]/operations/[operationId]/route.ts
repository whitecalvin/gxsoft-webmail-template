import { linkedOperationRoute } from "@/lib/tastemail/linked-operations-route";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; operationId: string }> }) {
  const { id, operationId } = await context.params;
  return linkedOperationRoute(request, id, operationId);
}
