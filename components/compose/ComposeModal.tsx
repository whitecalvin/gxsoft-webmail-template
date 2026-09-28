"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Clock, Maximize2, Minimize2, Paperclip, Trash2, Upload, X } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { InlineBanner } from "@/components/banner/InlineBanner";
import { ComposeEditor } from "@/components/compose/ComposeEditor";
import type { ComposeDraft } from "@/types/mail";
import { lockBodyScroll } from "@/lib/overlay-scroll-lock";
import type { LiveAddressSuggestion } from "@/lib/tastemail/contacts";

// The compose window keeps the mock send demo separate from live draft,
// upload, and submission requests. AI and scheduling remain mock-only.
const INTERNAL_DOMAIN = "@gxsoft.co.kr";
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024 * 1024;
const LARGE_FILE_LINK_THRESHOLD = 25 * 1024 * 1024;
const TONE_OPTIONS = [
  { key: "polite" },
  { key: "concise" },
  { key: "english" },
] as const;
type ToneKey = (typeof TONE_OPTIONS)[number]["key"];

interface Recipient {
  id: string;
  label: string;
  initials: string;
  bg: string;
  fg: string;
}

interface Attachment {
  id: string;
  name: string;
  size: number;
  ext: string;
  blobId?: string;
  type?: string;
}

const RECIPIENT_PALETTE = [
  { bg: "#E4EAFE", fg: "#2B4BF2" },
  { bg: "#E9F3EC", fg: "#2E8B5B" },
  { bg: "#EDEBF7", fg: "#6B5CA8" },
  { bg: "#FDF0E4", fg: "#B4740F" },
  { bg: "#E8F1F5", fg: "#3B7A94" },
  { bg: "#FBEAE8", fg: "#C0433B" },
];

const EXT_STYLE: Record<string, { bg: string; fg: string }> = {
  pdf: { bg: "#FBEAE8", fg: "#C0433B" },
  doc: { bg: "#E9EEFC", fg: "#2B4BF2" },
  docx: { bg: "#E9EEFC", fg: "#2B4BF2" },
  xls: { bg: "#E9F3EC", fg: "#2E8B5B" },
  xlsx: { bg: "#E9F3EC", fg: "#2E8B5B" },
  ppt: { bg: "#FDF0E4", fg: "#B4740F" },
  pptx: { bg: "#FDF0E4", fg: "#B4740F" },
  zip: { bg: "#EDEBF7", fg: "#6B5CA8" },
  png: { bg: "#E8F1F5", fg: "#3B7A94" },
  jpg: { bg: "#E8F1F5", fg: "#3B7A94" },
  jpeg: { bg: "#E8F1F5", fg: "#3B7A94" },
};
const DEFAULT_EXT_STYLE = { bg: "#F0F0EC", fg: "#5C6068" };

// Deterministic hash so the same recipient always gets the same chip color
// across renders/sessions, without storing a color per contact anywhere.
function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function parseRecipients(raw: string): Recipient[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => {
      const palette = RECIPIENT_PALETTE[hashString(label) % RECIPIENT_PALETTE.length];
      const namePart = label.split("@")[0];
      const initials = namePart.slice(0, 2);
      return {
        id: `rcpt-${label}-${Math.random().toString(36).slice(2, 6)}`,
        label,
        initials,
        bg: palette.bg,
        fg: palette.fg,
      };
    });
}

function formatBytes(bytes: number, locale: string) {
  if (bytes < 1024) return new Intl.NumberFormat(locale, { style: "unit", unit: "byte", unitDisplay: "narrow" }).format(bytes);
  if (bytes < 1024 * 1024) return new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", unitDisplay: "narrow", maximumFractionDigits: 0 }).format(bytes / 1024);
  return new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", unitDisplay: "narrow", maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
}

function toAttachments(files: FileList | File[]): Attachment[] {
  return Array.from(files).map((f) => ({
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: f.name,
    size: f.size,
    ext: f.name.split(".").pop()?.toLowerCase() ?? "",
  }));
}

function ComposeForm({
  initial,
  onClose,
}: {
  initial: ComposeDraft;
  onClose: () => void;
}) {
  const t = useTranslations("composeModal");
  const tReading = useTranslations("readingPane");
  const locale = useLocale();
  const { sendEmail, mode, retryLoad } = useMail();
  const tService = useTranslations("liveService");
  const toast = useToast();
  const [recipients, setRecipients] = useState<Recipient[]>(() => parseRecipients(initial.to));
  const [recipientInput, setRecipientInput] = useState("");
  const [suggestions, setSuggestions] = useState<LiveAddressSuggestion[]>([]);
  const [suggestionResultQuery, setSuggestionResultQuery] = useState("");
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [suggestionError, setSuggestionError] = useState<"unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | null>(null);
  const [showCcBcc, setShowCcBcc] = useState(Boolean(initial.cc || initial.bcc));
  const [cc, setCc] = useState(initial.cc ?? "");
  const [bcc, setBcc] = useState(initial.bcc ?? "");
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [insertedSignature, setInsertedSignature] = useState<string | null>(null);
  const bodyTouched = useRef(false);
  const [tone, setTone] = useState<ToneKey | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>(() => (initial.attachments ?? []).map((attachment, index) => ({
    ...attachment,
    id: `forwarded-${index}`,
    ext: attachment.name.split(".").pop()?.toLowerCase() ?? "",
  })));
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [fromAddress, setFromAddress] = useState<string | null>(null);
  const [ownAddresses, setOwnAddresses] = useState<string[]>([]);
  const [maxAttachmentBytes, setMaxAttachmentBytes] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const titleId = useId();
  const suggestionListId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recipientInputRef = useRef<HTMLInputElement>(null);
  const ccInputRef = useRef<HTMLInputElement>(null);
  const scheduleButtonRef = useRef<HTMLButtonElement>(null);
  const scheduleMenuRef = useRef<HTMLDivElement>(null);
  const numberFormatter = new Intl.NumberFormat(locale);
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const formatTime = (hour: number) => timeFormatter.format(new Date(Date.UTC(2026, 0, 1, hour)));
  const scheduleOptions = [
    { id: "today", label: t("schedule.today", { time: formatTime(18) }) },
    { id: "tomorrow", label: t("schedule.tomorrow", { time: formatTime(9) }) },
    { id: "nextMonday", label: t("schedule.nextMonday", { time: formatTime(9) }) },
  ];

  useEffect(() => {
    if (mode !== "live") return;
    const controller = new AbortController();
    fetch("/api/mail/compose", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || typeof payload.from !== "string" || typeof payload.signature !== "string" || !Number.isSafeInteger(payload.maxAttachmentBytes) ||
            !Array.isArray(payload.availableFrom) || !payload.availableFrom.every((item: unknown) => typeof item === "string")) throw new Error(payload.status ?? "unavailable");
        if (!controller.signal.aborted) {
          const chosenFrom = initial.fromAddress
            ? payload.availableFrom.find((item: string) => item.toLowerCase() === initial.fromAddress?.toLowerCase())
            : payload.from;
          if (!chosenFrom) {
            setComposeError("identityMismatch");
            return;
          }
          setFromAddress(chosenFrom);
          setOwnAddresses(payload.availableFrom);
          setMaxAttachmentBytes(payload.maxAttachmentBytes);
          if (!initial.previousDraftId && !initial.body && !bodyTouched.current && payload.signature) {
            const signatureBlock = `\n\n-- \n${payload.signature}`;
            setInsertedSignature(signatureBlock);
            setBody((current) => current ? current : signatureBlock);
          }
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setComposeError(error instanceof Error ? error.message : "retryable");
      });
    return () => controller.abort();
  }, [mode, initial.body, initial.fromAddress, initial.previousDraftId]);

  const hasContent =
    recipients.length > 0 ||
    subject.trim() ||
    (body.trim() && body !== insertedSignature) ||
    attachments.length > 0 ||
    recipientInput.trim() ||
    cc.trim() ||
    bcc.trim();
  const ccAddrs = cc
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const bccAddrs = bcc
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const liveComposePayload = () => {
    const to = [...recipients.map((recipient) => recipient.label), ...recipientInput.split(/[,;\n]+/u).map((value) => value.trim()).filter(Boolean)];
    const self = initial.replyAll ? new Set(ownAddresses.map((address) => address.toLowerCase())) : null;
    return {
      to: self ? to.filter((address) => !self.has(address.toLowerCase())) : to,
      cc: self ? ccAddrs.filter((address) => !self.has(address.toLowerCase())) : ccAddrs,
      bcc: bccAddrs,
      fromAddress: fromAddress ?? undefined,
      subject, body,
      inReplyTo: initial.inReplyTo ?? [],
      references: initial.references ?? [],
      ...(initial.previousDraftId ? { previousDraftId: initial.previousDraftId } : {}),
      attachments: attachments.map(({ blobId, name, type, size }) => ({ blobId, name, type, size })),
    };
  };
  // Drives the "N external recipients" warning banner — anyone whose address
  // isn't on the internal domain, across To/Cc/Bcc combined.
  const externalCount =
    recipients.filter((r) => !r.label.toLowerCase().endsWith(INTERNAL_DOMAIN)).length +
    [...ccAddrs, ...bccAddrs].filter((a) => !a.toLowerCase().endsWith(INTERNAL_DOMAIN)).length;

  const recipientQuery = recipientInput.split(/[,;\n]/u).at(-1)?.trim() ?? "";
  const visibleSuggestions = suggestionOpen && recipientQuery === suggestionResultQuery ? suggestions : [];

  useEffect(() => {
    if (mode !== "live" || recipientQuery.length < 2 || [...recipientQuery].length > 200) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: recipientQuery });
        const response = await fetch(`/api/mail/contact-suggestions?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !Array.isArray(payload.suggestions)) throw new Error(payload.status ?? "unavailable");
        setSuggestions(payload.suggestions);
        setSuggestionResultQuery(recipientQuery);
        setActiveSuggestion(0);
        setSuggestionError(null);
        setSuggestionOpen(payload.suggestions.length > 0);
      } catch (error) {
        if (controller.signal.aborted) return;
        const status = error instanceof Error ? error.message : "retryable";
        setSuggestions([]);
        setSuggestionError(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(status) ? status as typeof suggestionError : "retryable");
        setSuggestionResultQuery(recipientQuery);
        setSuggestionOpen(true);
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, recipientQuery]);

  const selectSuggestion = (suggestion: LiveAddressSuggestion) => {
    const pending = recipientInput.split(/[,;\n]+/u).slice(0, -1).map((value) => value.trim()).filter(Boolean);
    setRecipients((previous) => [...previous, ...parseRecipients([...pending, suggestion.email].join(", "))]);
    setRecipientInput("");
    setSuggestionOpen(false);
    recipientInputRef.current?.focus();
  };

  const commitRecipientInput = () => {
    const val = recipientInput.trim();
    if (!val) return;
    setRecipients((prev) => [...prev, ...parseRecipients(val.split(/[,;\n]+/u).join(", "))]);
    setRecipientInput("");
    setSuggestionOpen(false);
  };

  const handleRecipientKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (visibleSuggestions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestion((index) => (index + (e.key === "ArrowDown" ? 1 : visibleSuggestions.length - 1)) % visibleSuggestions.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectSuggestion(visibleSuggestions[activeSuggestion] ?? visibleSuggestions[0]);
        return;
      }
    }
    if (e.key === "Escape" && suggestionOpen) { e.preventDefault(); setSuggestionOpen(false); return; }
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitRecipientInput();
    } else if (e.key === "Backspace" && !recipientInput && recipients.length > 0) {
      setRecipients((prev) => prev.slice(0, -1));
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (mode === "live") {
      const incomingBytes = incoming.reduce((total, file) => total + file.size, 0);
      const existingBytes = attachments.reduce((total, file) => total + file.size, 0);
      if (uploading || incoming.length + attachments.length > 20 || incomingBytes + existingBytes > maxAttachmentBytes) { setComposeError("invalid_request"); return; }
      setUploading(true);
      setComposeError(null);
      void Promise.allSettled(incoming.map(async (file) => {
        if (!file.size || file.size > MAX_ATTACHMENT_BYTES) throw new Error("invalid_request");
        const response = await fetch(`/api/mail/upload?name=${encodeURIComponent(file.name)}`, {
          method: "POST", headers: { "content-type": file.type || "application/octet-stream" }, body: file,
          signal: AbortSignal.timeout(120_000),
        });
        const payload = await response.json();
        if (!response.ok || typeof payload.blobId !== "string" || typeof payload.type !== "string" || typeof payload.size !== "number") {
          throw new Error(payload.status ?? "unavailable");
        }
        return { id: `att-${crypto.randomUUID()}`, name: file.name, size: payload.size, ext: file.name.split(".").pop()?.toLowerCase() ?? "", blobId: payload.blobId, type: payload.type };
      })).then((results) => {
        const uploaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        if (uploaded.length) setAttachments((current) => [...current, ...uploaded]);
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") setComposeError(failed.reason instanceof Error ? failed.reason.message : "unavailable");
      }).finally(() => setUploading(false));
      return;
    }
    const tooBig = incoming.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const accepted = incoming.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    if (accepted.length > 0) {
      setAttachments((prev) => [...prev, ...toAttachments(accepted)]);
      const large = accepted.filter((f) => f.size > LARGE_FILE_LINK_THRESHOLD);
      if (large.length > 0) {
        toast.info(t("largeFilesBecomeLinks"), { sub: large.map((f) => f.name).join(", ") });
      }
    }
    if (tooBig.length > 0) {
      toast.error(t("fileTooLarge"), { sub: tooBig.map((f) => f.name).join(", ") });
    }
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "live") {
      if (submitting || uploading || !fromAddress || submissionUncertain) return;
      setSubmitting(true);
      setComposeError(null);
      void fetch("/api/mail/compose", {
        method: "POST", headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ action: "send", ...liveComposePayload() }),
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload.status !== "submitted") throw new Error(payload.status ?? "unavailable");
        retryLoad();
        toast.success(t("sent"), payload.previousDraftCleanupConfirmed === false ? { sub: t("oldDraftMayRemain") } : undefined);
        onClose();
      }).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : "submission_uncertain";
        if (reason === "draft_uncertain" || reason === "submission_rejected_draft_uncertain") {
          setSubmissionUncertain(true);
          setComposeError(reason);
        } else if (!["invalid_request", "unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)) {
          setSubmissionUncertain(true);
          setComposeError("submission_uncertain");
        } else setComposeError(reason);
      })
        .finally(() => setSubmitting(false));
      return;
    }
    commitRecipientInput();
    const toStr = recipients.map((r) => r.label).join(", ") || recipientInput.trim();
    const attachmentNote =
      attachments.length > 0 ? `\n\n${t("attachmentNote", { count: numberFormatter.format(attachments.length), names: attachments.map((a) => a.name).join(", ") })}` : "";
    sendEmail({ to: toStr, cc, bcc, subject, body: body + attachmentNote });
    const sub = [
      attachments.length > 0 ? t("attachmentCount", { count: numberFormatter.format(attachments.length) }) : null,
      bccAddrs.length > 0 ? t("bccCount", { count: numberFormatter.format(bccAddrs.length) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    toast.success(t("sent"), sub ? { sub } : undefined);
  };

  const handleClose = () => {
    if (submitting || uploading) return;
    if (hasContent) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockBodyScroll();
    recipientInputRef.current?.focus();
    return () => {
      unlock();
      if (previouslyFocused?.isConnected && previouslyFocused.getClientRects().length > 0) {
        previouslyFocused.focus();
      } else {
        Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-compose-trigger], button[data-mobile-menu-trigger]'))
          .find((button) => button.getClientRects().length > 0)?.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (scheduleOpen) scheduleMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [scheduleOpen]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (confirmingDiscard) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (scheduleOpen) {
        setScheduleOpen(false);
        scheduleButtonRef.current?.focus();
      } else handleClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="file"]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-compose-dialog
      className="fixed inset-0 z-(--layer-modal) flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onKeyDown={handleDialogKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <form
        onSubmit={handleSend}
        onClick={(e) => e.stopPropagation()}
        className={`relative flex h-full w-full flex-col overflow-hidden bg-background shadow-2xl transition-all sm:h-[min(88vh,760px)] sm:max-h-none sm:max-w-[calc(100vw-2rem)] sm:rounded-[14px] sm:border sm:border-(--border-app) ${
          expanded ? "sm:w-260" : "sm:w-190"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-(--border-app) px-4 py-3">
          <h2 id={titleId} className="text-sm font-bold tracking-tight">{initial.previousDraftId ? tReading("editDraft") : t("newMail")}</h2>
          {mode === "mock" ? <span className="rounded-full bg-(--surface-muted) px-2 py-0.5 text-[11px] text-(--text-muted)">
            {t("savedJustNow")}
          </span> : fromAddress ? <span className="truncate text-xs text-(--text-muted)">{fromAddress}</span> : null}
          <div className="ml-auto flex items-center gap-1 text-(--text-muted)">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="hidden rounded p-1.5 hover:bg-black/5 dark:hover:bg-white/10 sm:block"
              aria-label={expanded ? t("collapse") : t("expand")}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex size-11 items-center justify-center rounded-(--radius-app) outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:hover:bg-white/10 sm:size-auto sm:p-1.5"
              aria-label={t("close")}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col px-4">
            <div className="flex items-start gap-3 border-b border-(--border-app) py-2.5">
              <span className="mt-1.5 shrink-0 text-xs font-semibold text-(--text-muted)">{t("to")}</span>
              <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {recipients.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRecipients((prev) => prev.filter((x) => x.id !== r.id))}
                    className="group flex items-center gap-1.5 rounded-full bg-(--surface-muted) py-1 pl-1 pr-2.5 text-xs font-medium hover:bg-black/6 dark:hover:bg-white/10"
                    title={t("removeRecipient")}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                      style={{ backgroundColor: r.bg, color: r.fg }}
                    >
                      {r.initials}
                    </span>
                    {r.label}
                    <X size={10} className="text-(--text-muted) group-hover:text-(--status-danger)" />
                  </button>
                ))}
                <input
                  ref={recipientInputRef}
                  type="text"
                  aria-label={t("to")}
                  role={mode === "live" ? "combobox" : undefined}
                  aria-autocomplete={mode === "live" ? "list" : undefined}
                  aria-controls={mode === "live" ? suggestionListId : undefined}
                  aria-expanded={mode === "live" ? visibleSuggestions.length > 0 : undefined}
                  aria-activedescendant={visibleSuggestions.length > 0 ? `${suggestionListId}-${activeSuggestion}` : undefined}
                  autoComplete="off"
                  value={recipientInput}
                  onChange={(e) => { setRecipientInput(e.target.value); setSuggestionOpen(false); setSuggestionError(null); }}
                  onFocus={() => { if (recipientQuery === suggestionResultQuery && suggestions.length > 0) setSuggestionOpen(true); }}
                  onKeyDown={handleRecipientKeyDown}
                  onBlur={() => { setSuggestionOpen(false); commitRecipientInput(); }}
                  placeholder={t("recipientPlaceholder")}
                  className="min-w-0 flex-1 basis-35 bg-transparent text-base outline-none placeholder:text-(--text-muted) md:text-xs"
                />
                {mode === "live" && suggestionOpen && recipientQuery === suggestionResultQuery && (visibleSuggestions.length > 0 || suggestionError) ? (
                  <ul id={suggestionListId} role="listbox" className="absolute top-full left-0 z-(--layer-popover) mt-2 max-h-56 w-full min-w-56 overflow-y-auto rounded-lg border border-(--border-app) bg-background py-1 text-foreground shadow-lg">
                    {visibleSuggestions.map((suggestion, index) => (
                      <li id={`${suggestionListId}-${index}`} key={suggestion.email.toLowerCase()} role="option" aria-selected={index === activeSuggestion}>
                        <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => selectSuggestion(suggestion)} className="flex w-full flex-col px-3 py-2 text-left text-xs hover:bg-(--surface-muted) focus-visible:bg-(--surface-muted)" >
                          <span className="font-medium">{suggestion.name || suggestion.email}</span>
                          {suggestion.name ? <span className="text-(--text-muted)">{suggestion.email}</span> : null}
                        </button>
                      </li>
                    ))}
                    {suggestionError ? <li className="px-3 py-2 text-xs text-(--status-danger)">{tService(suggestionError)}</li> : null}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowCcBcc((v) => !v)}
                className="mt-1 shrink-0 text-[11.5px] font-medium"
                style={{ color: "var(--color-primary-ink)" }}
              >
                {t("ccAndBcc")}
                {ccAddrs.length + bccAddrs.length > 0 && ` (${ccAddrs.length + bccAddrs.length})`}
              </button>
            </div>

            {showCcBcc && (
              <>
                <div className="flex items-center gap-3 border-b border-(--border-app) py-2">
                  <span className="w-14 shrink-0 text-xs font-semibold text-(--text-muted)">{t("cc")}</span>
                  <input
                    ref={ccInputRef}
                    type="text"
                    aria-label={t("cc")}
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder={t("ccPlaceholder")}
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-(--text-muted) md:text-xs"
                  />
                </div>
                <div className="flex items-center gap-3 border-b border-(--border-app) py-2">
                  <span className="w-14 shrink-0 text-xs font-semibold text-(--text-muted)">{t("bcc")}</span>
                  <input
                    type="text"
                    aria-label={t("bcc")}
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder={t("bccPlaceholder")}
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-(--text-muted) md:text-xs"
                  />
                </div>
              </>
            )}

            <div className="flex items-center gap-3 py-2.5">
              <span className="w-14 shrink-0 text-xs font-semibold text-(--text-muted)">{t("subject")}</span>
              <input
                type="text"
                aria-label={t("subject")}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("subjectPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-(--text-muted) md:text-sm"
              />
            </div>
          </div>

          {composeError ? <p role="alert" className="mx-4 mb-2 text-sm text-(--status-danger)">{composeError === "submission_uncertain" ? t("submissionUncertain") : composeError === "submission_rejected_draft_uncertain" ? t("submissionRejectedDraftUncertain") : composeError === "draft_uncertain" ? t("draftSaveUncertain") : composeError === "identityMismatch" ? t("identityMismatch") : composeError === "invalid_request" ? t("invalidRequest") : ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(composeError) ? tService(composeError as "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable") : tService("unavailable")}</p> : null}
          {mode === "mock" ? <div className="mx-4 mb-1 flex flex-wrap items-center gap-3 rounded-xl border border-(--border-app) bg-(--surface-muted) px-4 py-3">
            <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md bg-(--color-primary-solid) text-[9px] font-extrabold text-white">
              AI
            </span>
            <span className="text-xs text-(--text-muted)">{t("toneHint")}</span>
            <div className="ml-auto flex gap-1.5">
              {TONE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setTone(option.key);
                    toast.info(t("rewritingTone", { tone: t(`tones.${option.key}`) }));
                  }}
                  className={`min-h-11 rounded-full px-2.5 text-[11px] font-semibold transition sm:min-h-0 sm:py-1 ${
                    tone === option.key
                      ? "bg-(--color-primary-solid) text-white"
                      : "border border-(--border-app) bg-background text-foreground hover:bg-(--control-hover)"
                  }`}
                >
                  {t(`tones.${option.key}`)}
                </button>
              ))}
            </div>
          </div> : null}

          {externalCount > 0 && (
            <div className="px-4 pb-1">
              <InlineBanner
                tone="warning"
                title={t("externalRecipientWarning", { count: numberFormatter.format(externalCount) })}
                body={t("externalRecipientBody")}
                actionLabel={t("reviewRecipients")}
                onAction={() => {
                  const toIsExternal = recipients.some((r) => !r.label.toLowerCase().endsWith(INTERNAL_DOMAIN));
                  if (toIsExternal) {
                    recipientInputRef.current?.focus();
                  } else {
                    setShowCcBcc(true);
                    requestAnimationFrame(() => ccInputRef.current?.focus());
                  }
                }}
              />
            </div>
          )}

          {mode === "live" ? <textarea
            aria-label={t("bodyPlaceholder")}
            value={body}
            onChange={(event) => { bodyTouched.current = true; setBody(event.target.value); }}
            placeholder={t("bodyPlaceholder")}
            className="min-h-45 flex-1 resize-none border-y border-(--border-app) px-4 py-3 text-base outline-none placeholder:text-(--text-muted) md:text-sm"
          /> : <ComposeEditor
            value={body}
            onChange={setBody}
            placeholder={t("bodyPlaceholder")}
            onImageAttach={(file) => addFiles([file])}
          />}

          <div className="flex flex-col gap-2 px-4 pb-3 sm:flex-row">
            {attachments.length > 0 && (
              <div className="flex flex-1 flex-col gap-1.5">
                {attachments.map((att) => {
                  const style = EXT_STYLE[att.ext] ?? DEFAULT_EXT_STYLE;
                  return (
                    <div
                      key={att.id}
                      className="flex items-center gap-2.5 rounded-[10px] border border-(--border-app) bg-background px-3 py-2"
                    >
                      <span
                        className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[7px] text-[9px] font-extrabold uppercase"
                        style={{ backgroundColor: style.bg, color: style.fg }}
                      >
                        {att.ext.slice(0, 3) || "FILE"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{att.name}</p>
                        <p className="text-[11px] text-(--text-muted)">
                          {t("uploadComplete", { size: formatBytes(att.size, locale) })}
                          {mode === "mock" && att.size > LARGE_FILE_LINK_THRESHOLD ? t("largeFileLinkSuffix") : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="shrink-0 text-(--text-muted) hover:text-(--status-danger)"
                        aria-label={t("removeAttachment")}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label={t("chooseAttachments")}
              className={`flex shrink-0 cursor-pointer items-center gap-2.5 rounded-[10px] border border-dashed px-3 py-2 outline-none transition focus-visible:ring-2 focus-visible:ring-(--focus-ring) sm:w-55 ${
                isDragging
                  ? "border-(--color-primary) bg-(--color-primary)/6"
                  : "border-(--border-app) bg-black/1.5 dark:bg-white/2"
              }`}
            >
              <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[7px] bg-(--surface-muted) text-(--text-muted)">
                <Upload size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold">{t("dropFiles")}</p>
                <p className="text-[11px] leading-tight text-(--text-muted)">
                  {mode === "mock" ? t("attachmentLimits") : null}
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-(--border-app) bg-(--surface-muted) px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-2.5">
          <div className="relative shrink-0">
            <div className="flex items-center overflow-hidden rounded-[9px]" style={{ backgroundColor: "var(--color-primary-solid)" }}>
              <button
                type="submit"
                disabled={mode === "live" && (submitting || uploading || !fromAddress || submissionUncertain)}
                className="min-h-11 px-4 text-[13px] font-semibold text-white transition hover:brightness-110 sm:min-h-0 sm:py-2"
              >
                {t("send")}
              </button>
              {mode === "mock" ? <span className="h-4 w-px bg-white/30" /> : null}
              {mode === "mock" ? <>
              <button
                ref={scheduleButtonRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={scheduleOpen}
                onClick={() => setScheduleOpen((v) => !v)}
                className="flex min-h-11 items-center gap-1 px-2.5 text-[11px] font-medium text-white/90 transition hover:brightness-110 sm:min-h-0 sm:py-2"
              >
                <Clock size={12} />
                {t("scheduleSend")}
              </button>
              </> : null}
            </div>
            {mode === "mock" && scheduleOpen && (
              <>
                <button type="button" tabIndex={-1} aria-label={t("closeScheduleMenu")} className="fixed inset-0 z-(--layer-popover-backdrop) cursor-default" onClick={() => { setScheduleOpen(false); scheduleButtonRef.current?.focus(); }} />
                <div ref={scheduleMenuRef} role="group" aria-label={t("scheduleTimes")} className="absolute bottom-full left-0 z-(--layer-popover) mb-2 w-48 overflow-hidden rounded-[10px] border border-(--border-app) bg-background py-1 text-foreground shadow-xl">
                  {scheduleOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setScheduleOpen(false);
                        commitRecipientInput();
                        toast.success(t("scheduled"), { sub: option.label });
                        onClose();
                      }}
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex size-11 items-center justify-center rounded-lg text-(--text-muted) outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:hover:bg-white/10 sm:size-auto sm:p-1.5"
              aria-label={t("attachFile")}
              title={t("attachFile")}
            >
              <Paperclip size={15} />
            </button>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {mode === "mock" ? <span className="hidden items-center gap-1.5 text-[11px] text-(--text-muted) sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-(--status-success)" />
              {t("tlsEncrypted")}
            </span> : null}
            <button
              type="button"
              onClick={handleClose}
              className="flex size-11 items-center justify-center rounded-lg text-(--text-muted) outline-none hover:bg-black/5 hover:text-(--status-danger) focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:hover:bg-white/10 sm:size-auto sm:p-1.5"
              aria-label={t("delete")}
              title={t("delete")}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </form>

      {confirmingDiscard && (
        <ConfirmDialog
          tone="default"
          title={t("discardTitle")}
          description={submissionUncertain ? t(composeError === "draft_uncertain" ? "draftSaveUncertain" : composeError === "submission_rejected_draft_uncertain" ? "submissionRejectedDraftUncertain" : "submissionUncertain") : t("discardDescription")}
          cancelLabel={t("continueEditing")}
          confirmLabel={t("saveDraft")}
          confirmDisabled={mode === "live" && (submitting || uploading || !fromAddress || submissionUncertain)}
          onCancel={() => setConfirmingDiscard(false)}
          middleAction={{
            label: t("discardWithoutSaving"),
            onClick: () => {
              setConfirmingDiscard(false);
              onClose();
            },
          }}
          onConfirm={() => {
            if (mode === "live") {
              if (submitting || uploading || !fromAddress || submissionUncertain) return;
              setSubmitting(true);
              setComposeError(null);
              void fetch("/api/mail/compose", {
                method: "POST", headers: { "content-type": "application/json" },
                signal: AbortSignal.timeout(60_000),
                body: JSON.stringify({ action: "draft", ...liveComposePayload() }),
              }).then(async (response) => {
                const payload = await response.json();
                if (!response.ok || payload.status !== "saved") throw new Error(payload.status ?? "unavailable");
                retryLoad();
                setConfirmingDiscard(false);
                toast.info(t("draftSaved"), payload.previousDraftCleanupConfirmed === false ? { sub: t("oldDraftMayRemain") } : undefined);
                onClose();
              }).catch((error: unknown) => {
                setConfirmingDiscard(false);
                const reason = error instanceof Error ? error.message : "draft_uncertain";
                if (["invalid_request", "unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)) {
                  setComposeError(reason);
                } else {
                  setSubmissionUncertain(true);
                  setComposeError("draft_uncertain");
                }
              })
                .finally(() => setSubmitting(false));
              return;
            }
            setConfirmingDiscard(false);
            toast.info(t("draftSaved"));
            onClose();
          }}
        />
      )}
    </div>
  );
}

export function ComposeModal() {
  const { composeDraft, composeSessionId, closeCompose } = useMail();

  if (!composeDraft) return null;

  // Keying on composeSessionId forces React to unmount/remount ComposeForm
  // (rather than diffing props) whenever openCompose() is called again, so
  // a fresh "reply" always starts from a clean form instead of merging into
  // whatever was left in a still-open compose window.
  return <ComposeForm key={composeSessionId} initial={composeDraft} onClose={closeCompose} />;
}
