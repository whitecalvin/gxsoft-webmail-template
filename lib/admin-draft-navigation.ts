/** Same-document links do not discard a form; foreign/download/new-tab links are left to the browser. */
export function adminDraftDestination(href: string, currentHref: string): string | null {
  const current = new URL(currentHref), destination = new URL(href, current);
  if (destination.origin !== current.origin || `${destination.pathname}${destination.search}` === `${current.pathname}${current.search}`) return null;
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
