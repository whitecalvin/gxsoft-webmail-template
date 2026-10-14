import { gmailOAuthAdminRoute } from "@/lib/tastemail/admin-gmail-oauth-route";
export const runtime = "nodejs";
export const POST = (request: Request) => gmailOAuthAdminRoute(request, "check");
