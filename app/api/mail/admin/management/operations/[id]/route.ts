import { NextResponse } from "next/server";
import { AdminRemoteError, loadAdminRemoteOperation } from "@/lib/tastemail/admin-remote";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
export const runtime = "nodejs";
const json=(data:object,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params; if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return json({status:"invalid_request"},400);
  try{assertLiveApiConfigured();}catch{return json({status:"configuration_error"},503);}
  const token=await tastemailSessionToken();if(!token)return json({status:"unauthorized"},401);
  try{return json(await loadAdminRemoteOperation(token,id));}catch(e){const status=e instanceof AdminRemoteError?e.status:"retryable";return json({status},status==="unauthorized"?401:status==="forbidden"?403:status==="notFound"?404:status==="rateLimited"?429:503);}
}
