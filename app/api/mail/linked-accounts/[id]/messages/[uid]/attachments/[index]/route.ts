import { linkedAttachmentRoute } from "@/lib/tastemail/linked-attachment-route";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; uid: string; index: string }> }) {
  const { id, uid, index } = await context.params;
  return linkedAttachmentRoute(request, id, uid, index);
}
