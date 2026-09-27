import { useEffect, useRef } from "react";
import { lockBodyScroll } from "@/lib/overlay-scroll-lock";
import { containTabFocus } from "./contain-tab-focus";

export function useSheetFocus(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      } else {
        containTabFocus(event, panel);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlock();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return panelRef;
}
