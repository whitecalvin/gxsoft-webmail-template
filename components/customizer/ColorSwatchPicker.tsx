"use client";

import { useId } from "react";
import { Check } from "lucide-react";

export function ColorSwatchPicker({ options, value, onSelect, label }: { options: { label: string; value: string }[]; value: string; onSelect: (value: string) => void; label: string }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value === option.value;
        return <label key={option.value} title={option.label} className="flex size-11 cursor-pointer items-center justify-center rounded-full">
          <input type="radio" name={name} value={option.value} checked={selected} aria-label={option.label} onChange={() => onSelect(option.value)} className="peer sr-only" />
          <span className="flex size-8 items-center justify-center rounded-full transition-transform peer-focus-visible:outline-3 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-(--focus-ring) hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100" style={{ backgroundColor: option.value, boxShadow: selected ? "0 0 0 2px var(--surface-app), 0 0 0 4px currentColor" : undefined, color: option.value }}>
            {selected ? <Check size={14} className="text-white" aria-hidden="true" /> : null}
          </span>
        </label>;
      })}
    </div>
  );
}
