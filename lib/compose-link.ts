// 작성 링크는 웹/메일 주소만 허용한다. javascript:, data:, 상대 경로는 제외한다.
export function composeLinkUrl(value: string): string | null {
  const input = value.trim();
  if (!input || /[\u0000-\u0020\u007f]/u.test(input)) return null;
  try {
    const url = new URL(input);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    if (url.protocol === "mailto:" && !url.pathname) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
