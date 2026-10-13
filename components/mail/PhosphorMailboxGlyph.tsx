"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CircleHelp, LoaderCircle } from "lucide-react";
import { loadedMailboxGlyph, preloadMailboxGlyph, renderLoadedMailboxGlyph, subscribeMailboxGlyphs } from "@/lib/mailbox-glyph-loader";

export default function PhosphorMailboxGlyph({ name, size = 20 }: { name: string; size?: number }) {
  const [loaded, setLoaded] = useState<{ name: string; failed: boolean } | null>(null);
  const ready = useSyncExternalStore(subscribeMailboxGlyphs, () => !!loadedMailboxGlyph("phosphor", name), () => false);
  useEffect(() => {
    let active = true;
    void preloadMailboxGlyph("phosphor", name).then(icon => { if (active) setLoaded({ name, failed: !icon }); });
    return () => { active = false; };
  }, [name]);
  return ready ? renderLoadedMailboxGlyph("phosphor", name, size) : loaded?.name === name && loaded.failed
    ? <CircleHelp size={size} aria-hidden="true" /> : <LoaderCircle size={size} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />;
}
