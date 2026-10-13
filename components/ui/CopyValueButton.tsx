"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Button } from "./Button";

export function CopyValueButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("copyValue");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ value: string; status: "copied" | "error" } | null>(null);
  const flight = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const status = result?.value === value ? result.status : null;
  async function copy() {
    if (flight.current) return;
    flight.current = true; setBusy(true); setResult(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      if (alive.current) setResult({ value, status: "copied" });
    } catch { if (alive.current) setResult({ value, status: "error" }); }
    finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  return <span className="inline-flex flex-wrap items-center gap-2">
    <Button type="button" size="sm" loading={busy} disabled={busy} aria-label={`${label} · ${t("copy")}`} leadingIcon={status === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />} onClick={() => void copy()}>{t(busy ? "copying" : "copy")}</Button>
    {status === "copied" && <span role="status" className="text-xs text-(--text-muted)">{t("copied")}</span>}
    {status === "error" && <span role="alert" className="text-xs text-(--status-danger)">{t("error")}</span>}
  </span>;
}
