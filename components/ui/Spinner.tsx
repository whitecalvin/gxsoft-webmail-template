import { LoaderCircle } from "lucide-react";
import { cn } from "./utils";

export function Spinner({ label = "Loading", size = 18, className }: { label?: string; size?: number; className?: string }) {
  return <span role="status" className={cn("inline-flex items-center", className)}><LoaderCircle size={size} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="sr-only">{label}</span></span>;
}
