import { linkedMailRoute } from "@/lib/tastemail/linked-mail-route";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; uid: string }> }) {
  const { id, uid } = await context.params;
  return linkedMailRoute(request, id, uid);
}
