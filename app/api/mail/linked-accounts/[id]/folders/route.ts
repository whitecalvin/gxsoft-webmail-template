import { linkedFoldersRoute } from "@/lib/tastemail/linked-folders-route";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return linkedFoldersRoute(request, (await context.params).id);
}
