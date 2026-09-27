"use client";

// Blocking, non-dismissible overlay with a progress bar for actions that
// simulate taking time (e.g. "send now" on a scheduled mail).
export function LoadingModal({
  title,
  sub,
  pct,
}: {
  title: string;
  sub: string;
  pct: number;
}) {
  return (
    <div
      className="fixed inset-0 z-(--layer-modal) flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--overlay-backdrop)" }}
    >
      <div role="status" aria-live="polite" aria-label={title} className="flex w-full max-w-75 flex-col items-center gap-2 rounded-(--radius-app) bg-background p-4 text-center text-foreground">
        <div
          className="h-8.5 w-8.5 animate-spin rounded-full border-[3px] motion-reduce:animate-none"
          style={{ borderColor: "var(--control-muted)", borderTopColor: "var(--color-primary-ink)" }}
        />
        <p className="text-[13.5px] font-bold">{title}</p>
        <p className="text-[12px] text-(--text-muted)">{sub}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--control-muted)">
          <div
            role="progressbar"
            aria-label={title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(Math.max(pct, 0), 100)}
            className="h-full rounded-full bg-(--color-primary-ink) transition-[width] motion-reduce:transition-none"
            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
