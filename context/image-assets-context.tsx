"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { ImageSnapshot } from "@/lib/image-assets";
const Context = createContext<{ brand: ImageSnapshot | null; avatar: ImageSnapshot | null }>({ brand: null, avatar: null });
export function ImageAssetsProvider({ brand, avatar, children }: { brand: ImageSnapshot | null; avatar: ImageSnapshot | null; children: ReactNode }) { return <Context.Provider value={{ brand, avatar }}>{children}</Context.Provider>; }
export function useImageAssets() { return useContext(Context); }
