"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { LinkedMailDetail } from "@/lib/linked-mail";
import { linkedInlinePlan, linkedRasterDataUrl } from "@/lib/linked-inline-image";
import { LiveHtmlMessageBody } from "@/components/mail/LiveHtmlMessageBody";
import { Button } from "@/components/ui/Button";
import { linkedAttachmentBlob } from "./LinkedAttachmentDownload";
export function LinkedHtmlMessageBody({ detail, subject, sender }: { detail: LinkedMailDetail; subject: string; sender: string }) {
  const t = useTranslations("readingPane"), service = useTranslations("liveService");
  const plan = useMemo(() => linkedInlinePlan(detail), [detail]);
  const scope = detail;
  const [state, setState] = useState<{ scope: object; sources: Map<string, string>; failed: boolean } | null>(null);
  const cache = useRef<{ scope: object; sources: Map<string, string> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const current = state?.scope === scope ? state : null;
  useEffect(() => {
    if (!plan.images.length) return;
    const controller = new AbortController();
    const sources = new Map(cache.current?.scope === scope ? cache.current.sources : []);
    const missing = plan.images.filter(a => !sources.has(a.cid!.toLowerCase()));
    void Promise.allSettled(missing.map(async image => {
      const blob = await linkedAttachmentBlob(detail, image, controller.signal);
      const source = await linkedRasterDataUrl(blob, image);
      return [image.cid!.toLowerCase(), source] as const;
    })).then(results => {
      if (controller.signal.aborted) return;
      for (const result of results) if (result.status === "fulfilled") sources.set(...result.value);
      cache.current = { scope, sources };
      setState({ scope, sources, failed: results.some(result => result.status === "rejected") });
      setRetrying(false);
    });
    return () => controller.abort();
  }, [detail, scope, plan, attempt]);
  return <>
    {plan.images.length && !current ? <p role="status" className="mt-4 text-xs text-(--text-muted)">{t("inlineImagesLoading")}</p> : null}
    {plan.unavailable || current?.failed ? <div role="alert" className="mt-4 flex flex-wrap items-center gap-2 text-xs text-(--status-danger)"><span>{t("inlineImagesUnavailable")}</span>{current?.failed ? <Button size="sm" disabled={retrying} loading={retrying} onClick={() => { if (!retrying) { setRetrying(true); setAttempt(a => a + 1); } }}>{service("retry")}</Button> : null}</div> : null}
    {!plan.images.length || current ? <LiveHtmlMessageBody isolatedReadOnly isolatedInlineSources={current?.sources} html={detail.body.htmlBody ?? ""} subject={subject} senderEmail={sender} blockedExternalImages={detail.body.blockedExternalImages} /> : null}
  </>;
}
