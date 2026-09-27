import { cn } from "./utils";
import Image from "next/image";

const SIZE = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-base", xl: "size-16 text-xl" } as const;

export function Avatar({ name, src, alt, size = "md", status, className }: { name: string; src?: string; alt?: string; size?: keyof typeof SIZE; status?: "online" | "away" | "busy" | "offline"; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const statusColor = status === "online" ? "bg-(--status-success)" : status === "away" ? "bg-(--status-warning)" : status === "busy" ? "bg-(--status-danger)" : "bg-(--text-muted)";
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span className={cn("flex items-center justify-center overflow-hidden rounded-full bg-(--color-accent-solid) font-semibold text-white", SIZE[size])}>
        {src ? <Image src={src} alt={alt ?? name} width={64} height={64} unoptimized className="size-full object-cover" /> : <span aria-hidden="true">{initials || "?"}</span>}
      </span>
      {status ? <span className={cn("absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-(--surface-app)", statusColor)} aria-label={status} /> : null}
    </span>
  );
}
