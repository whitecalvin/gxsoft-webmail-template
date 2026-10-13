"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useImageAssets } from "@/context/image-assets-context";
import { IMAGE_LIMITS, imageSnapshot, imageAssetFailure, type ImageScope } from "@/lib/image-assets";
import { ImageFilePicker } from "@/components/ui/ImageFilePicker";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";

export function ImageAssetSettings({ scope }: { scope: ImageScope }) {
  const initial = useImageAssets()[scope], t = useTranslations("imageAssets"), router = useRouter();
  const service = useTranslations("liveService");
  const [snapshot, setSnapshot] = useState(initial), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false), [pickerKey, setPickerKey] = useState(0);
  const [hasPending, setHasPending] = useState(false);
  const pending = useRef<{ id: string; revision: number; file: File | null; operation: "replace" | "delete" } | null>(null);
  const lock = useRef(false), alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; pending.current = null; }; }, []);
  const endpoint = `/api/mail/images/${scope}`;
  async function load() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(12000) }); if (!response.ok) throw new Error(imageAssetFailure(response.status)); const next = imageSnapshot(await response.json(), scope); if (alive.current) setSnapshot(next); }
    catch (cause) { if (alive.current) setError(cause instanceof Error && ["unauthorized", "forbidden", "rateLimited"].includes(cause.message) ? cause.message : "failed"); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function save(operation: "replace" | "delete") {
    if (lock.current || !snapshot || (operation === "replace" && !file && !pending.current)) return;
    lock.current = true; setBusy(true); setError(null); setSaved(false); setConfirmDelete(false);
    const task = pending.current ?? { id: crypto.randomUUID(), revision: snapshot.revision, file: operation === "replace" ? file : null, operation };
    pending.current = task; setHasPending(true);
    try {
      const response = await fetch(`${endpoint}?expectedRevision=${task.revision}&requestId=${task.id}`, { method: task.operation === "replace" ? "PUT" : "DELETE", headers: task.file ? { "Content-Type": task.file.type } : undefined, body: task.file, signal: AbortSignal.timeout(20000) });
      const value = await response.json();
      if (!response.ok) {
        if (response.status < 500) { pending.current = null; if (alive.current) { setHasPending(false); setError(imageAssetFailure(response.status, value)); if ([401, 403, 409].includes(response.status)) setSnapshot(null); } }
        else if (alive.current) setError("unknown");
        return;
      }
      if (value.requestId !== task.id || value.operation !== task.operation || value.previousRevision !== task.revision || value.revision !== task.revision + 1) throw new Error();
      // 영수증은 과거 결과이므로 현재 메타데이터를 다시 조회한다. 자동 재변경하지 않는다.
      const current = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!current.ok) throw new Error();
      const next = imageSnapshot(await current.json(), scope);
      pending.current = null;
      if (alive.current) { setHasPending(false); setSnapshot(next); setFile(null); setPickerKey(n => n + 1); setSaved(true); router.refresh(); }
    } catch { if (alive.current) setError("unknown"); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="grid gap-3 rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) p-4" aria-busy={busy}>
    <h2 className="text-sm font-semibold">{t(scope)}</h2><p className="text-xs text-(--text-muted)">{t("limits")}</p>
    {snapshot?.image ? <div>
      {/* 인증 아바타는 같은 출처 BFF만 사용한다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={snapshot.image.url} alt={t(scope)} width={64} height={64} className="size-16 rounded-(--radius-app) object-contain" />
    </div> : null}
    <ImageFilePicker key={pickerKey} limits={IMAGE_LIMITS} label={t("file")} chooseLabel={t("choose")} clearLabel={t("clear")} previewAlt={t("preview")} disabled={busy || hasPending || !snapshot} onChange={next => { setFile(next); setSaved(false); }} errors={{ format: t("format"), size: t("size"), dimensions: t("dimensions"), decode: t("decode") }} />
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" disabled={busy || !snapshot || !file || hasPending} onClick={() => void save("replace")}>{t("save")}</Button>
      <Button disabled={busy || !snapshot?.image || hasPending} onClick={() => setConfirmDelete(true)}>{t("remove")}</Button>
      {!hasPending ? <Button variant="ghost" disabled={busy} onClick={() => void load()}>{t("reload")}</Button> : <Button disabled={busy} onClick={() => { if (pending.current) void save(pending.current.operation); }}>{t("retrySame")}</Button>}
    </div>
    {!snapshot && !error ? <p role="status" className="text-sm text-(--text-muted)">{t("failed")}</p> : null}
    {error ? <p role="alert" className="text-sm text-(--status-danger)">{["unauthorized", "forbidden", "rateLimited"].includes(error) ? service(error) : t(error)}</p> : null}
    {saved ? <p role="status" className="text-sm text-(--status-success)">{t("saved")}</p> : null}
    {confirmDelete ? <ConfirmDialog tone="destructive" title={t("remove")} description={t("removeDescription")} confirmLabel={t("remove")} onConfirm={() => void save("delete")} onCancel={() => setConfirmDelete(false)} /> : null}
  </section>;
}
