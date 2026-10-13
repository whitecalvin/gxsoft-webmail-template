import "server-only";
import glyphs from "./mailbox-svg.generated.json";
import { mailboxIconEntry } from "./mailbox-icon-catalog.mjs";
import type { MailboxIconPreferences } from "./mailbox-icon-preferences";

/** Only selected, package-generated SVGs cross the server/client boundary. */
export function initialMailboxGlyphs(preferences: MailboxIconPreferences): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const value of Object.values(preferences)) {
    const entry = mailboxIconEntry(value);
    if (!entry || entry.packageId === "emoji") continue;
    const key = `${entry.packageId}:${entry.name}`;
    if (Object.hasOwn(glyphs, key)) selected[key] = glyphs[key as keyof typeof glyphs];
  }
  return selected;
}
