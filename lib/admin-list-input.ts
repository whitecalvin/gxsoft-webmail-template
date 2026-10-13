export function adminListInputValues(text: string, addresses = false): string[] {
  return text.split(addresses ? /[\r\n,;]+/ : /\r?\n/).map(item => item.trim()).filter(Boolean);
}
