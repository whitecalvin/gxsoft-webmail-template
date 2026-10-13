"use client";

import { useEffect, useRef } from "react";
import { attachSelectionHistory } from "@/lib/mail-selection-history";

/** 모바일 상세 화면은 뒤로 가기를 먼저 소비하고, 페이지 이탈은 다음 단계로 남긴다. */
export function useMobilePane(active: boolean, onDismiss: () => void) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    if (!active || !window.matchMedia("(max-width: 1023px)").matches) return;
    return attachSelectionHistory(window, () => dismiss.current(), "gxmailPane");
  }, [active]);
}
