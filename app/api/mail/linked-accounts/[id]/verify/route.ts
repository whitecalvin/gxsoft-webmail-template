import { linkedAuthenticationRoute } from "@/lib/tastemail/linked-authentication-route";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return linkedAuthenticationRoute(request, (await context.params).id, "verify");
}
