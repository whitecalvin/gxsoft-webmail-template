export type RemoteImagePolicy = "always" | "contacts" | "never";

export function hasExternalImages(html: string): boolean {
  return /(?:\bsrc|\bbackground)\s*=\s*["']?\s*https:\/\/|\burl\(\s*["']?\s*https:\/\//iu.test(html);
}

export function shouldShowExternalImages(
  policy: RemoteImagePolicy,
  hydrated: boolean,
  knownContact: boolean,
  override: boolean | null,
  trustedSender = false,
): boolean {
  return override ?? (hydrated && (trustedSender || policy === "always" || (policy === "contacts" && knownContact)));
}

export function normalizeImageSenders(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, senders]) => Array.isArray(senders)).map(([account, senders]) => [
    account.trim().toLowerCase(), [...new Set((senders as unknown[]).filter((sender): sender is string => typeof sender === "string" && sender.includes("@")).map((sender) => sender.trim().toLowerCase()))],
  ]));
}
