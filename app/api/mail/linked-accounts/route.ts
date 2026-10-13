import { linkedAccountRoute } from "@/lib/tastemail/linked-account-route";
export const runtime = "nodejs";
export async function GET() { return linkedAccountRoute(); }
export async function POST(request: Request) { return linkedAccountRoute(request); }
