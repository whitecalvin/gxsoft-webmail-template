import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";
import { cn } from "./utils";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title"> {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  compact?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", compact = false, className, ...props },
  ref,
) {
  return (
    <Tooltip content={label} side="bottom" className="shrink-0">
    <Button
      ref={ref}
      variant={variant}
      size="icon"
      aria-label={label}
      className={cn(compact && "size-8", className)}
      {...props}
    >
      {icon}
    </Button>
    </Tooltip>
  );
});
