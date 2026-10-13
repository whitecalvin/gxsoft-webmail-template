import { linkedMailRoute } from "@/lib/tastemail/linked-mail-route";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return linkedMailRoute(request, (await context.params).id);
}
