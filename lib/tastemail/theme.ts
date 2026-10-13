import "server-only";
import { projectServerTheme, type ServerTheme } from "@/lib/server-theme";
import { tastemailRequest } from "./server";

export async function loadServerTheme(token: string | null): Promise<ServerTheme | null> {

  try {
    const response = await tastemailRequest(token ? "/api/themes/resolved" : "/api/themes/system/resolved", token ?? undefined, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) throw new Error("Theme unavailable");
    const text = await response.text();
    if (text.length > 16_384) throw new Error("Theme response too large");
    const theme = projectServerTheme(JSON.parse(text));
    if (!token && theme.source !== "system") throw new Error("Invalid public theme");
    return theme;
  } catch {
    // Unknown live policy must not let a stored preference bypass an admin lock.
    return { theme: { id: "tastemail-base", version: null }, density: "comfortable", colorMode: "light", source: "fallback", userSelectionAllowed: false };
  }
}
