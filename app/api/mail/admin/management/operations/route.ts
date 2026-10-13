import { NextResponse } from "next/server";
import { AdminRemoteError, submitAdminRemote } from "@/lib/tastemail/admin-remote";
import { AdminRemoteInputError, adminRemoteCommand } from "@/lib/admin-remote-contract";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
export const runtime = "nodejs";
const json = (data: object, status = 200) => NextResponse.json(data, {status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request: Request) {
  try { const origin = new URL(request.headers.get("origin") ?? ""), target = new URL(request.url); const host = request.headers.get("host") ?? target.host, protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? target.protocol.slice(0,-1); if (origin.host !== host || origin.protocol !== `${protocol}:`) return json({status:"forbidden"},403); } catch { return json({status:"forbidden"},403); }
  try { assertLiveApiConfigured(); } catch { return json({status:"configuration_error"},503); }
  const token = await tastemailSessionToken(); if (!token) return json({status:"unauthorized"},401);
  let command;
  try {
    const reader = request.body?.getReader(); if (!reader) throw Error("Missing body"); const parts: Uint8Array[]=[]; let size=0;
    while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>4096) {await reader.cancel(); throw Error("Oversized request");} parts.push(value); }
    const bytes=new Uint8Array(size); let offset=0; for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    command=adminRemoteCommand(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
  } catch { return json({status:"invalid_request"},400); }
  try { return json(await submitAdminRemote(token,command),202); } catch(e) { const status=e instanceof AdminRemoteInputError || e instanceof AdminRemoteError ? e.status : "mutationUncertain"; return json({status},status==="invalid_request"?400:status==="unauthorized"?401:status==="forbidden"?403:status==="conflict"?409:status==="rateLimited"?429:["unsupported","managementNotConfigured"].includes(status)?501:503); }
}
