import { generalSettingsRoute } from "@/lib/tastemail/general-settings-route";
export const runtime = "nodejs";
export async function GET() { return generalSettingsRoute(); }
export async function PATCH(request: Request) { return generalSettingsRoute(request); }
