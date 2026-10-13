import { writeIconPreferences } from "@/lib/tastemail/icon-preferences-route";

export const runtime = "nodejs";
export async function POST(request: Request) { return writeIconPreferences(request, true); }
