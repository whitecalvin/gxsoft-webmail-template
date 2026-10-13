import { readIconPreferences, writeIconPreferences } from "@/lib/tastemail/icon-preferences-route";

export const runtime = "nodejs";
export async function GET(request: Request) { return readIconPreferences(request); }
export async function PATCH(request: Request) { return writeIconPreferences(request); }
