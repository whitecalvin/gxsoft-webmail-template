export function safeMailLink(raw: string | null): string | null {
  if (!raw || /[\u0000-\u0020\u007f]/u.test(raw)) return null;
  try {
    // 상대 주소를 웹메일의 인증된 경로로 해석하지 않습니다.
    const url = new URL(raw);
    if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.protocol === "mailto:" && (!url.pathname || /%0[ad]/iu.test(raw))) return null;
    return url.href;
  } catch { return null; }
}

/** Delegate user navigation from the isolated mail DOM without granting it popup/script privileges. */
export function attachMailBodyLinks(document: Document, open: (url: string) => void): () => void {
  const click = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (target?.nodeType !== 1) return;
    const link = target.closest("a[href], area[href]");
    if (!link || !document.body.contains(link)) return;
    event.preventDefault();
    if (!event.isTrusted || (event.button !== 0 && event.button !== 1)) return;
    const raw = link.getAttribute("href");
    if (raw?.startsWith("#")) {
      try { document.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView(); } catch { /* malformed fragment */ }
      return;
    }
    const url = safeMailLink(raw);
    if (url) open(url);
  };
  document.addEventListener("click", click);
  document.addEventListener("auxclick", click);
  return () => {
    document.removeEventListener("click", click);
    document.removeEventListener("auxclick", click);
  };
}
