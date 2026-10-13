"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "./Button";
import { inspectLocalImage, LocalImageError, type LocalImageFailure, type LocalImageLimits } from "@/lib/local-image-file";

export function ImageFilePicker({ limits, label, chooseLabel, clearLabel, previewAlt, errors, disabled = false, onChange }: {
  limits: LocalImageLimits; label: string; chooseLabel: string; clearLabel: string; previewAlt: string;
  errors: Record<LocalImageFailure, string>; disabled?: boolean; onChange: (file: File | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const lifecycle = useRef({ active: false, sequence: 0, url: "" });
  const [preview, setPreview] = useState<{ url: string; name: string; width: number; height: number } | null>(null);
  const [failure, setFailure] = useState<LocalImageFailure | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const current = lifecycle.current; current.active = true;
    return () => { current.active = false; current.sequence++; if (current.url) URL.revokeObjectURL(current.url); current.url = ""; };
  }, []);
  const clear = () => {
    lifecycle.current.sequence++;
    if (lifecycle.current.url) URL.revokeObjectURL(lifecycle.current.url);
    lifecycle.current.url = "";
    setPreview(null); setFailure(null); setChecking(false); onChange(null);
  };
  const choose = async (file: File) => {
    const current = lifecycle.current;
    const sequence = ++current.sequence;
    setChecking(true); setFailure(null);
    try {
      const dimensions = await inspectLocalImage(file, limits);
      if (!current.active || sequence !== current.sequence) return;
      const url = URL.createObjectURL(file);
      if (current.url) URL.revokeObjectURL(current.url);
      current.url = url;
      setPreview({ url, name: file.name, ...dimensions }); onChange(file);
    } catch (error) {
      if (current.active && sequence === current.sequence) setFailure(error instanceof LocalImageError ? error.reason : "decode");
    } finally {
      if (current.active && sequence === current.sequence) setChecking(false);
    }
  };
  return <div className="grid min-w-0 gap-3" role="group" aria-labelledby={`${id}-label`} aria-busy={checking}>
    <p id={`${id}-label`} className="text-sm font-medium">{label}</p>
    <input ref={input} type="file" accept={limits.mimeTypes.join(",")} disabled={disabled} className="sr-only" tabIndex={-1} aria-label={chooseLabel}
      onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file && !disabled) void choose(file); }} />
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button disabled={disabled || checking} leadingIcon={<ImagePlus size={16} />} onClick={() => input.current?.click()}>{chooseLabel}</Button>
      {preview ? <Button variant="ghost" disabled={disabled} leadingIcon={<X size={16} />} onClick={clear}>{clearLabel}</Button> : null}
    </div>
    {preview ? <div className="flex min-w-0 items-center gap-3 rounded-(--radius-app) border border-(--border-app) p-3">
      {/* 선택한 로컬 파일만 표시하며, 서버 저장이나 프로필 변경으로 간주하지 않는다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.url} alt={previewAlt} width={64} height={64} className="size-16 shrink-0 rounded-(--radius-app) bg-(--surface-muted) object-contain" />
      <div className="min-w-0"><p className="break-all text-sm">{preview.name}</p><p className="text-xs text-(--text-muted)">{preview.width} × {preview.height}</p></div>
    </div> : null}
    {failure ? <p role="alert" className="text-sm text-(--status-danger)">{errors[failure]}</p> : null}
  </div>;
}
