"use client";

import dynamic from "next/dynamic";
import { mailboxIconEntry } from "@/lib/mailbox-icon-catalog.mjs";
import { useInitialMailboxGlyphs } from "@/context/mailbox-icon-context";
import { useSyncExternalStore } from "react";
import { loadedMailboxGlyph, renderLoadedMailboxGlyph, subscribeMailboxGlyphs } from "@/lib/mailbox-glyph-loader";

const Lucide = dynamic(() => import("./LucideMailboxGlyph"), { loading: () => <span className="size-5" /> });
const Phosphor = dynamic(() => import("./PhosphorMailboxGlyph"), { loading: () => <span className="size-5" /> });
export default function MailboxGlyph({ name, packageId = "lucide", size = 20 }: { name: string; packageId?: string; size?: number }) {
  const initialGlyphs = useInitialMailboxGlyphs();
  const ready = useSyncExternalStore(subscribeMailboxGlyphs, () => !!loadedMailboxGlyph(packageId, name), () => false);
  const entry = mailboxIconEntry(`${packageId}:${name}`);
  if (!entry) return null;
  if (entry.packageId === "emoji") return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center leading-none" style={{ fontSize: size, width: size, height: size }}>{entry.native}</span>;
  const svg = initialGlyphs[`${entry.packageId}:${entry.name}`];
  // 서버와 hydration이 동일한 SVG를 유지합니다. 저장된 아이콘은 effect를 기다리지 않습니다.
  // SVG 원본은 설치 패키지에서 생성한 서버 전용 manifest에만 존재합니다.
  if (svg) return <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-full" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
  if (ready) return renderLoadedMailboxGlyph(packageId, name, size);
  return entry.packageId === "phosphor" ? <Phosphor name={name} size={size} /> : <Lucide name={name} size={size} />;
}
