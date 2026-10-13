"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertTriangle, ImageOff, X } from "lucide-react";
import styles from "./MailImageWarning.module.css";
import { useSettings } from "@/context/settings-context";
import { useMail } from "@/context/mail-context";
import { imageDataUrl, MAX_INLINE_IMAGE_BYTES, MAX_INLINE_IMAGES, RASTER_IMAGE } from "@/lib/inline-image";
import { hasExternalImages, shouldShowExternalImages } from "@/lib/mail-image-policy";
import { observeExternalImageFailures } from "@/lib/mail-image-loading";
import { attachMailBodyLinks } from "@/lib/mail-body-links";
import type { Email } from "@/types/mail";
import { GeneralSettingsStatus } from "@/components/settings/GeneralSettingsStatus";

type Attachment = NonNullable<Email["attachments"]>[number];
const EMPTY_ATTACHMENTS: Attachment[] = [];

function setMailBodyLayout(body: HTMLElement, width: number | null) {
  // 고정폭 메일은 글자까지 축소하지 않고 원본 폭으로 가로 스크롤합니다.
  // 메일의 width:100%!important 규칙보다 측정한 폭을 우선합니다.
  if (width === null) body.style.removeProperty("width");
  else body.style.setProperty("width", `${width}px`, "important");
  body.style.transform = "";
  body.ownerDocument.documentElement.style.overflowX = width === null ? "hidden" : "auto";
}

function htmlDocument(html: string, sources: ReadonlyMap<string, string>, showExternalImages: boolean): string {
  const resolved = html.replace(/(\bsrc\s*=\s*)(["']?)cid:([^\s"'>]+)\2/giu,
    (match, prefix: string, quote: string, cid: string) => {
      const source = sources.get(cid.toLowerCase());
      return source ? `${prefix}${quote}${source}${quote}` : match.replace(`cid:${cid}`, "about:blank");
    });
  const imageSources = showExternalImages ? "data: https:" : "data:";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imageSources}; media-src 'none'; frame-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html{color-scheme:light;overflow:hidden;touch-action:pan-x pan-y}body{display:flow-root;margin:0;color:#334155;background:white;font:14px/1.7 system-ui,sans-serif;overflow-wrap:anywhere;overflow:hidden}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}@media(max-width:600px){img{max-width:100%!important;height:auto!important}table{max-width:100%!important}}</style></head><body>${resolved}</body></html>`;
}

export function LiveHtmlMessageBody({ html, subject, senderEmail, blockedExternalImages, attachments = EMPTY_ATTACHMENTS, accountId, isolatedReadOnly = false, isolatedInlineSources }: {
  html: string;
  subject: string;
  senderEmail: string;
  blockedExternalImages?: boolean;
  attachments?: Email["attachments"];
  accountId?: string;
  isolatedReadOnly?: boolean;
  isolatedInlineSources?: ReadonlyMap<string, string>;
}) {
  const t = useTranslations("readingPane");
  const service = useTranslations("liveService");
  const compose = useTranslations("composeModal");
  const { accountAddress } = useMail();
  const { saved, hydrated, busy: settingsBusy, uncertain, error: settingsError, isDirty, setRemoteImages, trustImageSender } = useSettings();
  const remoteImages = saved.inbox.remoteImages;
  const externalImagesPresent = blockedExternalImages === true || hasExternalImages(html);
  const inline = useMemo(() => attachments.filter((attachment) =>
    attachment.disposition === "inline" && attachment.cid && RASTER_IMAGE.test(attachment.type) &&
    attachment.size <= MAX_INLINE_IMAGE_BYTES && html.toLowerCase().includes(`cid:${attachment.cid.toLowerCase()}`)
  ).slice(0, MAX_INLINE_IMAGES), [attachments, html]);
  const inlineKey = `${accountId ?? ""}\0${inline.map((attachment) => `${attachment.blobId}\0${attachment.cid}`).join("\0")}`;
  const [inlineState, setInlineState] = useState<{ key: string; sources: Map<string, string>; failed: boolean }>({ key: "", sources: new Map(), failed: false });
  const [inlineAttempt, setInlineAttempt] = useState(0);
  const [imageOverride, setImageOverride] = useState<boolean | null>(null);
  const [contactState, setContactState] = useState<{ email: string; known: boolean } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameObserver = useRef<ResizeObserver | null>(null);
  const observedBody = useRef<HTMLElement | null>(null);
  const removeFrameListeners = useRef<(() => void) | null>(null);
  const [frameHeight, setFrameHeight] = useState(512);
  const externalObserver = useRef<ReturnType<typeof observeExternalImageFailures> | null>(null);
  const [externalFailure, setExternalFailure] = useState<{ source: string; count: number } | null>(null);
  const [dismissedFailureSource, setDismissedFailureSource] = useState<string | null>(null);
  const [failurePosition, setFailurePosition] = useState<{ right: number; bottom: number; width: number } | null>(null);
  const [failurePortalHost, setFailurePortalHost] = useState<HTMLElement | null>(null);
  const current = inlineState.key === inlineKey ? inlineState : null;
  const knownContact = contactState?.email === senderEmail && contactState.known === true;
  const trustedSender = !!accountAddress && (saved.inbox.remoteImageSenders[accountAddress.trim().toLowerCase()] ?? []).includes(senderEmail.trim().toLowerCase());
  const showExternalImages = isolatedReadOnly ? imageOverride === true : shouldShowExternalImages(remoteImages, hydrated, knownContact, imageOverride, trustedSender);
  const frameReady = isolatedReadOnly || hydrated || settingsError !== null || !externalImagesPresent;
  const document = htmlDocument(html, (isolatedReadOnly ? isolatedInlineSources : current?.sources) ?? new Map(), showExternalImages);
  const failedExternalImages = externalFailure?.source === document && showExternalImages ? externalFailure.count : 0;
  const showFailureNotice = failedExternalImages > 0 && dismissedFailureSource !== document;

  useEffect(() => {
    if (!showFailureNotice) return;
    const frame = frameRef.current;
    const view = frame?.ownerDocument.defaultView;
    if (!frame || !view) return;
    setFailurePortalHost(window.document.body);
    let container = frame.parentElement;
    while (container?.parentElement && !/auto|scroll/u.test(view.getComputedStyle(container).overflowY)) container = container.parentElement;
    if (!container) return;
    const update = () => {
      const rect = container.getBoundingClientRect();
      const right = Math.min(view.innerWidth, rect.right);
      const bottom = Math.min(view.innerHeight, rect.bottom);
      const width = Math.min(420, right - Math.max(0, rect.left) - 24);
      setFailurePosition(width > 0 && bottom > Math.max(0, rect.top) ? { right: view.innerWidth - right + 12, bottom: view.innerHeight - bottom + 12, width } : null);
    };
    // 본문 밖의 포털로 표시해 실패 감지·닫기·재시도가 본문 높이를 바꾸지 않습니다.
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update, true);
    };
  }, [showFailureNotice]);

  const observeFrame = useCallback(() => {
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    const body = frameDocument?.body;
    if (!frame || !frameDocument || !body || frameDocument.URL !== "about:srcdoc" || frameDocument.readyState === "loading" || !body.hasChildNodes() || frame.clientWidth === 0) return false;
    if (observedBody.current === body) return true;
    frameObserver.current?.disconnect();
    removeFrameListeners.current?.();
    externalObserver.current?.disconnect();
    externalObserver.current = showExternalImages ? observeExternalImageFailures(frameDocument, (count) => {
      setExternalFailure({ source: document, count });
    }) : null;
    observedBody.current = body;
    let measuredFrameWidth = 0;
    let measuredContentWidth = 0;
    const resize = () => {
      const frameWidth = frame.clientWidth;
      if (frameWidth === 0) return;
      const frameWidthChanged = frameWidth !== measuredFrameWidth;
      if (frameWidthChanged) {
        measuredFrameWidth = frameWidth;
        setMailBodyLayout(body, null);
      }
      const contentWidth = Math.max(frameWidth, body.scrollWidth);
      if (frameWidthChanged || contentWidth !== measuredContentWidth) {
        measuredContentWidth = contentWidth;
        setMailBodyLayout(body, contentWidth > frameWidth ? contentWidth : null);
      }
      setFrameHeight((height) => {
        const nextHeight = Math.max(512, Math.ceil(body.scrollHeight) + (contentWidth > frameWidth ? 20 : 0));
        return height === nextHeight ? height : nextHeight;
      });
    };
    resize();
    frameObserver.current = new ResizeObserver(resize);
    frameObserver.current.observe(body);
    frameObserver.current.observe(frame);
    const removeLinks = attachMailBodyLinks(frameDocument, (url) => {
      frame.ownerDocument.defaultView?.open(url, "_blank", "noopener,noreferrer");
    });
    frameDocument.addEventListener("load", resize, true);
    frame.ownerDocument.defaultView?.addEventListener("resize", resize);
    removeFrameListeners.current = () => {
      removeLinks();
      frameDocument.removeEventListener("load", resize, true);
      frame.ownerDocument.defaultView?.removeEventListener("resize", resize);
    };
    return true;
  }, [document, showExternalImages]);

  useEffect(() => {
    if (isolatedReadOnly || !externalImagesPresent || remoteImages !== "contacts" || !senderEmail.trim()) return;
    const controller = new AbortController();
    void fetch("/api/mail/contacts", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return false;
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object" || !("contacts" in payload) || !Array.isArray(payload.contacts)) return false;
        return payload.contacts.some((contact: unknown) => contact !== null && typeof contact === "object" &&
          "email" in contact && typeof contact.email === "string" && contact.email.trim().toLowerCase() === senderEmail.trim().toLowerCase());
      })
      .then((known) => { if (!controller.signal.aborted) setContactState({ email: senderEmail, known }); })
      .catch(() => { if (!controller.signal.aborted) setContactState({ email: senderEmail, known: false }); });
    return () => controller.abort();
  }, [externalImagesPresent, remoteImages, senderEmail, isolatedReadOnly]);

  useEffect(() => {
    if (isolatedReadOnly || inline.length === 0) return;
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
  }, [inline, inlineKey, accountId, inlineAttempt, isolatedReadOnly]);

  // Wait for the stored image policy before creating an external-image frame.
  // Otherwise hydration replaces srcDoc and downloads the same mail twice.
  useEffect(() => {
    if (!frameReady) return;
    let active = true;
    let animationFrame = 0;
    const tryObserve = () => {
      if (active && !observeFrame()) animationFrame = requestAnimationFrame(tryObserve);
    };
    animationFrame = requestAnimationFrame(tryObserve);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      frameObserver.current?.disconnect();
      removeFrameListeners.current?.();
      externalObserver.current?.disconnect();
      externalObserver.current = null;
      observedBody.current = null;
    };
  }, [document, frameReady, observeFrame]);
  return <section aria-label={t("htmlBody")} className="mt-4 min-w-0">
    {!isolatedReadOnly && (settingsError || uncertain) ? <GeneralSettingsStatus /> : null}
    {(isolatedReadOnly || hydrated) && externalImagesPresent && !showExternalImages ? <div className="mb-3 rounded-(--radius-app) border border-(--border-app) bg-(--surface-muted) p-3 text-xs">
      <div role="status" className="flex items-start gap-2 text-(--text-muted)">
        <ImageOff size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <div className="min-w-0 leading-5">
          <p>{t("remoteImagesBlocked")}</p>
          {!isolatedReadOnly ? <p>{t("remoteImagesAutoHint")}</p> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 sm:pl-6">
        {!isolatedReadOnly ? <button type="button" disabled={settingsBusy || uncertain || isDirty} onClick={async () => { if (await setRemoteImages(remoteImages === "always" ? "never" : "always")) setImageOverride(null); }} className="min-h-11 rounded-(--radius-app) border border-(--border-app) bg-background px-3 py-1.5 font-medium text-(--color-primary-ink) transition-colors hover:bg-(--surface-muted) disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) sm:min-h-8">
          {t(remoteImages === "always" ? "disableAllImagesAlways" : "showAllImagesAlways")}
        </button> : null}
        {!isolatedReadOnly && remoteImages !== "always" ? <button type="button" disabled={!accountAddress || !senderEmail.trim() || settingsBusy || uncertain || isDirty} onClick={async () => { if (accountAddress && await trustImageSender(accountAddress, senderEmail, !trustedSender)) setImageOverride(trustedSender ? false : null); }} className="min-h-11 rounded-(--radius-app) border border-(--border-app) bg-background px-3 py-1.5 font-medium text-(--color-primary-ink) transition-colors hover:bg-(--surface-muted) disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) sm:min-h-8">
          {t(trustedSender ? "disableSenderImagesAlways" : "showSenderImagesAlways")}
        </button> : null}
        <button type="button" onClick={() => setImageOverride(!showExternalImages)} className="min-h-11 rounded-(--radius-app) border border-(--border-app) bg-background px-3 py-1.5 font-medium text-(--color-primary-ink) transition-colors hover:bg-(--surface-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) sm:min-h-8">
          {t(showExternalImages ? "hideExternalImages" : "showImagesOnce")}
        </button>
      </div>
    </div> : null}
    {inline.length > 0 && !current ? <p role="status" className="mb-2 text-xs text-(--text-muted)">{t("inlineImagesLoading")}</p> : null}
    {current?.failed ? <div role="alert" className="mb-2 flex items-center gap-2 text-xs text-(--status-danger)"><span>{t("inlineImagesUnavailable")}</span><button type="button" onClick={() => { setInlineState({ key: "", sources: new Map(), failed: false }); setInlineAttempt((value) => value + 1); }} className="underline underline-offset-2">{service("retry")}</button></div> : null}
    {showFailureNotice && failurePosition && failurePortalHost ? createPortal(
      <div className={`${styles.enter} fixed z-(--layer-toast) flex items-start gap-3 rounded-(--radius-app) border border-(--status-warning)/30 border-l-4 border-l-(--status-warning) bg-(--status-warning-bg) p-3 text-xs text-(--status-warning) shadow-(--shadow-panel)`} style={failurePosition}>
        <AlertTriangle size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p role="alert" className="font-medium leading-5">{t("externalImagesUnavailable", { count: failedExternalImages })}</p>
        </div>
        <button type="button" onClick={() => externalObserver.current?.retry()} className="min-h-8 shrink-0 self-center rounded-md border border-(--status-warning)/30 px-2.5 py-1.5 font-semibold transition-colors hover:bg-(--status-warning)/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)">{service("retry")}</button>
        <button type="button" aria-label={compose("close")} onClick={() => setDismissedFailureSource(document)} className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-(--status-warning)/10 focus-visible:outline-2 focus-visible:outline-(--focus-ring)"><X size={16} aria-hidden="true" /></button>
      </div>, failurePortalHost
    ) : null}
    {frameReady ? <iframe ref={frameRef} title={`${subject} · ${t("htmlBody")}`} sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={document}
      onLoad={observeFrame} style={{ height: frameHeight }} className="mx-auto block w-full max-w-160 border-0 bg-white" /> : null}
  </section>;
}
