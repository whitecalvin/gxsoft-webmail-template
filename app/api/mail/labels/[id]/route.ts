import { labelRoute } from "@/lib/tastemail/label-route";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Context) { return labelRoute(request, (await params).id); }
export async function DELETE(request: Request, { params }: Context) { return labelRoute(request, (await params).id); }
