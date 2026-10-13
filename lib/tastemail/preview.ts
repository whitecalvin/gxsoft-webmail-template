/** Remove invisible email padding from a short list/search excerpt, not the message body. */
export function normalizeMailPreview(value: string): string {
  return value
    .replace(/[\u00ad\u034f\u061c\u180e\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}
