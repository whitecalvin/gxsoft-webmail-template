import { labelRoute } from "@/lib/tastemail/label-route";
export const runtime = "nodejs";
export async function GET() { return labelRoute(); }
export async function POST(request: Request) { return labelRoute(request); }
