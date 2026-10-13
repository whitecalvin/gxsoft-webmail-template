"use client";
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_PUBLIC_BRANDING, type PublicBranding } from "@/lib/branding";

const BrandingContext = createContext<PublicBranding>(DEFAULT_PUBLIC_BRANDING);
export function BrandingProvider({ branding, children }: { branding: PublicBranding; children: ReactNode }) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}
export function useBranding() { return useContext(BrandingContext); }
