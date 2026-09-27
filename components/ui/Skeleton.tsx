import { cn } from "./utils";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded-(--radius-app) bg-(--control-muted) motion-reduce:animate-none", className)} />;
}
