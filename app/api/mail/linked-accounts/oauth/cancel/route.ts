import { linkedOAuthCancelRoute } from "@/lib/tastemail/linked-oauth-route";
export const runtime = "nodejs";
export async function POST(request: Request) { return linkedOAuthCancelRoute(request); }
