import { gmailOAuthAdminRoute } from "@/lib/tastemail/admin-gmail-oauth-route";
export const runtime = "nodejs";
export const GET = (request: Request) => gmailOAuthAdminRoute(request, "read");
export const PATCH = (request: Request) => gmailOAuthAdminRoute(request, "save");
