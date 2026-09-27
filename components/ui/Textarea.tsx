import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "./utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className, disabled, rows = 4, ...props },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const descriptionId = hint || error ? `${textareaId}-description` : undefined;

  return (
    <label htmlFor={textareaId} className="grid min-w-0 gap-1.5 text-sm">
      {label ? <span className="font-medium text-foreground">{label}</span> : null}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={descriptionId}
        className={cn(
          "min-h-24 w-full resize-y rounded-(--radius-app) border bg-background px-3 py-2.5 text-base text-foreground outline-none transition-[border-color,box-shadow,background-color] motion-reduce:transition-none placeholder:text-(--text-muted) focus:ring-2 disabled:cursor-not-allowed disabled:bg-(--surface-muted) disabled:opacity-60 md:text-sm",
          error ? "border-(--status-danger) focus:border-(--status-danger) focus:ring-(--status-danger)" : "border-(--border-app) focus:border-(--color-primary-ink) focus:ring-(--focus-ring)",
          className,
        )}
        {...props}
      />
      {error || hint ? (
        <span id={descriptionId} role={error ? "alert" : undefined} className={cn("text-xs", error ? "text-(--status-danger)" : "text-(--text-muted)")}>
          {error ?? hint}
        </span>
      ) : null}
    </label>
  );
});
