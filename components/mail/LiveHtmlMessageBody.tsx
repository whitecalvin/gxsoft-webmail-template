"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { Email } from "@/types/mail";

type Attachment = NonNullable<Email["attachments"]>[number];
const MAX_INLINE_IMAGE_BYTES = 5_000_000;
const MAX_INLINE_IMAGES = 10;
const RASTER_IMAGE = /^image\/(?:png|jpeg|gif|webp)$/iu;
const EMPTY_ATTACHMENTS: Attachment[] = [];

function htmlDocument(html: string, sources: ReadonlyMap<string, string>): string {
  const resolved = html.replace(/(\bsrc\s*=\s*)(["']?)cid:([^\s"'>]+)\2/giu,
    (match, prefix: string, quote: string, cid: string) => {
      const source = sources.get(cid.toLowerCase());
      return source ? `${prefix}${quote}${source}${quote}` : match.replace(`cid:${cid}`, "about:blank");
    });
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src 'none'; frame-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html{color-scheme:light}body{margin:0;padding:20px;color:#334155;background:white;font:14px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}td,th{padding:4px;border:1px solid #d8deea}pre{white-space:pre-wrap}</style></head><body>${resolved}</body></html>`;
}

async function imageDataUrl(attachment: Attachment, accountId: string | undefined, signal: AbortSignal): Promise<string> {
  const params = new URLSearchParams({ blobId: attachment.blobId });
  if (accountId) params.set("accountId", accountId);
  const response = await fetch(`/api/mail/attachments?${params}`, { cache: "no-store", signal });
  if (!response.ok || Number(response.headers.get("content-length")) > MAX_INLINE_IMAGE_BYTES || !response.body) throw new Error("inline image unavailable");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_INLINE_IMAGE_BYTES || signal.aborted) {
      await reader.cancel();
      throw new Error("inline image unavailable");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const part of parts) { bytes.set(part, position); position += part.byteLength; }
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return `data:${attachment.type.toLowerCase()};base64,${btoa(chunks.join(""))}`;
}

export function LiveHtmlMessageBody({ html, subject, blockedExternalImages, attachments = EMPTY_ATTACHMENTS, accountId }: {
  html: string;
  subject: string;
  blockedExternalImages?: boolean;
  attachments?: Email["attachments"];
  accountId?: string;
}) {
  const t = useTranslations("readingPane");
  const service = useTranslations("liveService");
  const inline = useMemo(() => attachments.filter((attachment) =>
    attachment.disposition === "inline" && attachment.cid && RASTER_IMAGE.test(attachment.type) &&
    attachment.size <= MAX_INLINE_IMAGE_BYTES && html.toLowerCase().includes(`cid:${attachment.cid.toLowerCase()}`)
  ).slice(0, MAX_INLINE_IMAGES), [attachments, html]);
  const inlineKey = `${accountId ?? ""}\0${inline.map((attachment) => `${attachment.blobId}\0${attachment.cid}`).join("\0")}`;
  const [inlineState, setInlineState] = useState<{ key: string; sources: Map<string, string>; failed: boolean }>({ key: "", sources: new Map(), failed: false });
  const [inlineAttempt, setInlineAttempt] = useState(0);

  useEffect(() => {
    if (inline.length === 0) return;
    const controller = new AbortController();
    void Promise.allSettled(inline.map(async (attachment) => {
      const source = await imageDataUrl(attachment, accountId, controller.signal);
      return [attachment.cid!.toLowerCase(), source] as const;
    })).then((results) => {
      if (controller.signal.aborted) return;
      const sources = new Map<string, string>();
      for (const result of results) if (result.status === "fulfilled") sources.set(...result.value);
      setInlineState({ key: inlineKey, sources, failed: results.some((result) => result.status === "rejected") });
    });
    return () => controller.abort();
  }, [inline, inlineKey, accountId, inlineAttempt]);

  const current = inlineState.key === inlineKey ? inlineState : null;
  const document = htmlDocument(html, current?.sources ?? new Map());
  return <section aria-label={t("htmlBody")} className="mt-4 min-w-0">
    {blockedExternalImages ? <p role="status" className="mb-2 text-xs text-(--text-muted)">{t("remoteImagesBlocked")}</p> : null}
    {inline.length > 0 && !current ? <p role="status" className="mb-2 text-xs text-(--text-muted)">{t("inlineImagesLoading")}</p> : null}
    {current?.failed ? <div role="alert" className="mb-2 flex items-center gap-2 text-xs text-(--status-danger)"><span>{t("inlineImagesUnavailable")}</span><button type="button" onClick={() => { setInlineState({ key: "", sources: new Map(), failed: false }); setInlineAttempt((value) => value + 1); }} className="underline underline-offset-2">{service("retry")}</button></div> : null}
    <iframe title={`${subject} · ${t("htmlBody")}`} sandbox="" referrerPolicy="no-referrer" srcDoc={document}
      className="h-[32rem] w-full rounded-lg border border-(--border-app) bg-white" />
  </section>;
}
