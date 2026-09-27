import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANT_STYLE: Record<ButtonVariant, string> = {
  primary: "bg-(--color-primary-solid) text-white shadow-sm hover:brightness-105 active:brightness-95",
  secondary: "border border-(--border-app) bg-background text-foreground hover:bg-(--surface-muted)",
  ghost: "text-foreground hover:bg-black/5 dark:hover:bg-white/8",
  danger: "bg-(--status-danger) text-white shadow-sm hover:brightness-105 active:brightness-95 dark:text-(--surface-app)",
};

const SIZE_STYLE: Record<ButtonSize, string> = {
  sm: "min-h-11 gap-1.5 px-3 py-1.5 text-xs md:[@media(pointer:fine)]:min-h-8",
  md: "min-h-11 gap-2 px-4 py-2 text-sm md:[@media(pointer:fine)]:min-h-10",
  lg: "min-h-11 gap-2 px-5 py-2.5 text-sm",
  icon: "size-10 min-h-11 min-w-11 p-0 md:[@media(pointer:fine)]:min-h-10 md:[@media(pointer:fine)]:min-w-10",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    leadingIcon,
    trailingIcon,
    disabled,
    className,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-(--radius-app) font-semibold outline-none transition-[background-color,color,border-color,box-shadow,filter,transform] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-45",
        VARIANT_STYLE[variant],
        SIZE_STYLE[size],
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : leadingIcon}
      {children}
      {!loading ? trailingIcon : null}
    </button>
  );
});
