"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

// Collapsible section wrapper used to group related controls inside
// CustomizerPanel (color, typography, layout, etc.).
export function CustomizerSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-(--border-app)">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
      >
        {title}
        <ChevronDown
          size={16}
          className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="space-y-4 px-4 pb-4">{children}</div>}
    </div>
  );
}
