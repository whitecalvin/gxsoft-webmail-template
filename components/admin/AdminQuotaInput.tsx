"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { MAX_QUOTA_GIB, quotaBytesValue, quotaGiBValue } from "@/lib/admin-quota";

export function AdminQuotaInput({ id, value, required, disabled, onChange }: {
  id: string; value: unknown; required?: boolean; disabled?: boolean; onChange: (bytes: string) => void;
}) {
  const [draft, setDraft] = useState(() => quotaGiBValue(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(quotaGiBValue(value));
    }
  }, [value]);
  return <Input id={id} type="number" min={0} max={MAX_QUOTA_GIB} step="any" required={required}
    disabled={disabled} value={draft} trailing="GiB" onChange={event => {
      setDraft(event.target.value);
      const bytes = quotaBytesValue(event.target.value) ?? "";
      emitted.current = bytes;
      onChange(bytes);
    }} />;
}
