import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./utils";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leadingIcon, trailing, id, className, disabled, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = hint || error ? `${inputId}-description` : undefined;

  return (
    <div className="grid min-w-0 gap-1.5 text-sm">
      {label ? <label htmlFor={inputId} className="font-medium text-foreground">{label}</label> : null}
      <span
        className={cn(
          "flex min-h-10 items-center gap-2 rounded-(--radius-app) border bg-background px-3 outline-none transition-[border-color,box-shadow,background-color] motion-reduce:transition-none focus-within:ring-2",
          error ? "border-(--status-danger) focus-within:border-(--status-danger) focus-within:ring-(--status-danger)" : "border-(--border-app) focus-within:border-(--color-primary-ink) focus-within:ring-(--focus-ring)",
          disabled && "cursor-not-allowed bg-(--surface-muted) opacity-60",
        )}
      >
        {leadingIcon ? <span className="shrink-0 text-(--text-muted)">{leadingIcon}</span> : null}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={descriptionId}
          className={cn("min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-(--text-muted) md:text-sm", className)}
          {...props}
        />
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </span>
      {error || hint ? (
        <span id={descriptionId} role={error ? "alert" : undefined} className={cn("text-xs", error ? "text-(--status-danger)" : "text-(--text-muted)")}>
          {error ?? hint}
        </span>
      ) : null}
    </div>
  );
});
