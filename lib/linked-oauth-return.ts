import { linkedOAuthCallback } from "./linked-oauth";
export type LinkedOAuthReturn = { state: string; code: string } | { state: string; cancelled: true };
export function parseLinkedOAuthReturn(params: URLSearchParams): LinkedOAuthReturn | null {
  const state = params.get("state");
  if (params.getAll("state").length !== 1 || !state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
  if (params.getAll("code").length === 1 && !params.has("error")) return linkedOAuthCallback({ state, code: params.get("code") });
  if (params.getAll("error").length === 1 && !params.has("code") && params.get("error")) return { state, cancelled: true };
  return null;
}
export function parseLinkedOAuthFragment(hash: string): LinkedOAuthReturn | null {
  if (!hash.startsWith("#") || hash.length > 16384) return null;
  const params = new URLSearchParams(hash.slice(1));
  if ([...params.keys()].some(k => !["state", "code", "error"].includes(k)) || [...params].length !== 2) return null;
  return parseLinkedOAuthReturn(params);
}
