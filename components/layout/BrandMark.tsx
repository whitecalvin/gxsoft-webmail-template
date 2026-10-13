"use client";

import { useState } from "react";
import { cn } from "@/components/ui/utils";
import { useImageAssets } from "@/context/image-assets-context";

/** Fixed dimensions keep the header stable while its image loads or fails. */
export function BrandMark({ imageUrl, className }: { imageUrl?: string | null; className?: string }) {
  const assets = useImageAssets();
  const url = imageUrl === undefined ? assets.brand?.image?.url : imageUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const visible = Boolean(url && url !== failedUrl);
  return <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-app) bg-(--color-primary-solid) text-xs font-bold text-white", className)}>
    {visible ? (
      // The authenticated same-origin asset is already validated by the server.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url!} alt="" width={36} height={36} className="size-full object-contain" onError={() => setFailedUrl(url!)} />
    ) : "G"}
  </span>;
}
