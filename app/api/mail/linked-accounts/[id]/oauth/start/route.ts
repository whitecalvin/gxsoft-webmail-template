import { linkedOAuthStartRoute } from "@/lib/tastemail/linked-oauth-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return linkedOAuthStartRoute(request, (await params).id);
}
