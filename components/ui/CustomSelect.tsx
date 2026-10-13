"use client";

import { Children, Fragment, isValidElement, useId, useState, type ReactNode } from "react";
import { Dropdown, type DropdownOption } from "./Dropdown";

type OptionProps = { value?: string; disabled?: boolean; children?: ReactNode };
function optionText(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<OptionProps>(child) ? optionText(child.props.children) : String(child)).join("");
}
export function customSelectOptions(children: ReactNode): DropdownOption[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<OptionProps>(child)) return [];
    if (child.type === Fragment) return customSelectOptions(child.props.children);
    return [{ value: child.props.value ?? optionText(child.props.children), label: optionText(child.props.children), disabled: child.props.disabled }];
  });
}

// Preserve existing controlled values and form constraints without rendering a
// native select. Option children are data only; the shared listbox draws the UI.
export function CustomSelect({ id, name, value, children, disabled, required, className, onChange, align, "aria-label": label, "aria-labelledby": labelledBy }: {
  id?: string; name?: string; value: string; children: ReactNode; disabled?: boolean; required?: boolean; className?: string;
  "aria-label"?: string; "aria-labelledby"?: string;
  align?: "left" | "right";
  onChange: (event: { target: { value: string } }) => void;
}) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const [validation, setValidation] = useState("");
  const options = customSelectOptions(children);
  const valid = options.some(option => option.value === value && !option.disabled);
  return <div className={`relative min-w-0 max-w-full ${className?.includes("w-full") ? "w-full" : "inline-block"}`}>
    <Dropdown value={value} options={options} label={label} labelledBy={labelledBy} triggerId={triggerId} required={required} align={align}
      disabled={disabled} overlay portal className="w-full" triggerClassName={className ?? "h-11 w-full rounded-(--radius-app) px-3 text-sm"}
      onChange={next => { setValidation(""); onChange({ target: { value: next } }); }} />
    <input type="text" name={name} value={valid ? value : ""} required={required} disabled={disabled} tabIndex={-1} aria-hidden="true" className="sr-only" onChange={() => {}}
      onInvalid={event => { event.preventDefault(); setValidation(event.currentTarget.validationMessage); document.getElementById(triggerId)?.focus(); }} />
    {validation ? <p role="alert" className="mt-1 text-xs text-(--status-danger)">{validation}</p> : null}
  </div>;
}
