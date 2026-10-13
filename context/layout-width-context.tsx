"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SIDEBAR_DEFAULT_WIDTH } from "@/lib/sidebar-width";
import { MAIL_LIST_DEFAULT_WIDTH } from "@/lib/mail-list-width";

export type LayoutWidths = { account: string; sidebar: number; mailList: number };
const LayoutWidthContext = createContext<LayoutWidths>({ account: "anonymous", sidebar: SIDEBAR_DEFAULT_WIDTH, mailList: MAIL_LIST_DEFAULT_WIDTH });
export function LayoutWidthProvider({ children, value }: { children: ReactNode; value: LayoutWidths }) {
  return <LayoutWidthContext.Provider value={value}>{children}</LayoutWidthContext.Provider>;
}
export function useLayoutWidths() { return useContext(LayoutWidthContext); }
