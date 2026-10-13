import "server-only";
import { DEFAULT_PUBLIC_BRANDING, projectPublicBranding } from "@/lib/branding";
import { tastemailRequest } from "./server";

export async function loadPublicBranding() {

  try {
    // Public endpoint: no session cookie or bearer token is needed or forwarded.
    const response = await tastemailRequest("/api/branding", undefined, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return DEFAULT_PUBLIC_BRANDING;
    const text = await response.text();
    if (text.length > 16_384) return DEFAULT_PUBLIC_BRANDING;
    return projectPublicBranding(JSON.parse(text));
  } catch {
    // Cosmetic defaults never replace live mail/session data on failure.
    return DEFAULT_PUBLIC_BRANDING;
  }
}
