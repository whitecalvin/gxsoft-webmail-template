import { linkedAccountRoute } from "@/lib/tastemail/linked-account-route";
export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return linkedAccountRoute(request, (await context.params).id);
}
