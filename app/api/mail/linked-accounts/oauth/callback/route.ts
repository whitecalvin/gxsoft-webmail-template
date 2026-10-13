import { linkedOAuthReturnRoute } from "@/lib/tastemail/linked-oauth-route";
export const runtime = "nodejs";
export async function GET(request: Request) { return linkedOAuthReturnRoute(request); }
