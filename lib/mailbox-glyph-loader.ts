import { createElement, type ComponentType } from "react";
import lucide from "lucide-react/dynamicIconImports.mjs";
import { imports as phosphor } from "./phosphor-mailbox-imports.mjs";

type Glyph = ComponentType<{ size: number; "aria-hidden": true }>;
const icons = new Map<string, Glyph>();
const pending = new Map<string, Promise<Glyph | null>>();
const listeners = new Set<() => void>();
export function subscribeMailboxGlyphs(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function loadedMailboxGlyph(packageId: string, name: string) {
  return icons.get(`${packageId}:${name}`) ?? null;
}
export function renderLoadedMailboxGlyph(packageId: string, name: string, size: number) {
  const Icon = loadedMailboxGlyph(packageId, name);
  return Icon ? createElement(Icon, { size, "aria-hidden": true }) : null;
}
/** Deduplicated preloading shared by picker previews and displayed icons. */
export function preloadMailboxGlyph(packageId: string, name: string): Promise<Glyph | null> {
  const key = `${packageId}:${name}`;
  const cached = icons.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  const imports = packageId === "lucide" ? lucide : packageId === "phosphor" ? phosphor : null;
  if (!imports || !Object.hasOwn(imports, name)) return Promise.resolve(null);
  const load = imports[name as keyof typeof imports];
  const request = load().then(module => {
    const Icon = module.default as Glyph;
    icons.set(key, Icon);
    listeners.forEach(listener => listener());
    return Icon;
  }).catch(() => null).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
