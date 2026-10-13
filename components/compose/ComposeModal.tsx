"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Clock, Maximize2, Minimize2, Paperclip, Trash2, Upload, X } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { useSettings } from "@/context/settings-context";
import { sendingComposeDefaults } from "@/lib/sending-settings";
import { savedDraftChanged } from "@/lib/mail-draft";
import { remainingFailedUploadNames } from "@/lib/tastemail/upload-failures";
import { requireUploadReceipt } from "@/lib/tastemail/upload-receipt";
import { MAX_INLINE_IMAGE_BYTES, MAX_INLINE_IMAGES, RASTER_IMAGE } from "@/lib/inline-image";
import { clientMailFailure, ComposeValidationError, requireConfirmedComposeMutation } from "@/lib/tastemail/client-session-status";
import { replyAllRecipients } from "@/lib/compose-recipients";
import { useToast } from "@/context/toast-context";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { InlineBanner } from "@/components/banner/InlineBanner";
import { ComposeEditor } from "@/components/compose/ComposeEditor";
import type { ComposeDraft } from "@/types/mail";
import { lockBodyScroll } from "@/lib/overlay-scroll-lock";
import type { LiveAddressSuggestion } from "@/lib/tastemail/contacts";

// Drafts, uploads and submissions use authenticated server requests.
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024 * 1024;

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
  disposition?: "attachment" | "inline";
  cid?: string | null;
}

function referencesInlineAttachment(html: string | null, attachment: Attachment): boolean {
  return Boolean(html && attachment.disposition === "inline" && attachment.cid && html.toLowerCase().includes(`cid:${attachment.cid.toLowerCase()}`));
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

function scheduledUtc(value: string, maxDelayedSend: number): string | null {
  const timestamp = Date.parse(value);
  const remaining = timestamp - Date.now();
  return Number.isFinite(timestamp) && remaining > 0 && remaining <= maxDelayedSend * 1000
    ? new Date(timestamp).toISOString() : null;
}

function ComposeForm({
  initial,
  onClose,
  sharedAccountId,
  onSubmitted,
}: {
  initial: ComposeDraft;
  onClose: () => void;
  sharedAccountId?: string;
  onSubmitted?: () => void;
}) {
  const t = useTranslations("composeModal");
  const tReading = useTranslations("readingPane");
  const locale = useLocale();
  const { mode, retryLoad, refreshScheduledSubmissions } = useMail();
  const tService = useTranslations("liveService");
  const toast = useToast();
  const { saved: preferences } = useSettings();
  const [sendingDefaults] = useState(() => sendingComposeDefaults(initial, preferences.sending, !!sharedAccountId));
  const [recipients, setRecipients] = useState<Recipient[]>(() => parseRecipients(initial.to));
  const [recipientInput, setRecipientInput] = useState("");
  const [suggestions, setSuggestions] = useState<LiveAddressSuggestion[]>([]);
  const [suggestionResultQuery, setSuggestionResultQuery] = useState("");
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [suggestionError, setSuggestionError] = useState<"unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | null>(null);
  const [showCcBcc, setShowCcBcc] = useState(Boolean(sendingDefaults.cc || sendingDefaults.bcc));
  const [cc, setCc] = useState(sendingDefaults.cc);
  const [bcc, setBcc] = useState(sendingDefaults.bcc);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [htmlBody, setHtmlBody] = useState<string | null>(initial.htmlBody ?? null);
  const [baselineHtml, setBaselineHtml] = useState<string | null>(initial.htmlBody ?? null);
  const [insertedSignature, setInsertedSignature] = useState<string | null>(null);
  const [insertedSignatureHtml, setInsertedSignatureHtml] = useState<string | null>(null);
  const bodyTouched = useRef(false);

  const [attachments, setAttachments] = useState<Attachment[]>(() => (initial.attachments ?? []).map((attachment, index) => ({
    ...attachment,
    id: `forwarded-${index}`,
    ext: attachment.name.split(".").pop()?.toLowerCase() ?? "",
  })));
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const [failedUploadNames, setFailedUploadNames] = useState<string[]>([]);
  const uploadFailed = failedUploadNames.length > 0;
  const [submitting, setSubmitting] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeValidationField, setComposeValidationField] = useState<string | null>(null);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  // Lock immediately: an old event handler may run before React commits the error state.
  const submissionUncertainRef = useRef(false);
  // A confirmed receipt also blocks stale handlers while onClose is committing.
  const submissionCompletedRef = useRef(false);
  const [fromAddress, setFromAddress] = useState<string | null>(null);
  const [ownAddresses, setOwnAddresses] = useState<string[]>([]);
  const [maxAttachmentBytes, setMaxAttachmentBytes] = useState(0);
  const [maxDelayedSend, setMaxDelayedSend] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [liveScheduleOptions, setLiveScheduleOptions] = useState<{ id: string; label: string; sendAtUtc: string }[]>([]);
  const [scheduleInput, setScheduleInput] = useState("");
  const submittingRef = useRef(false);
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

  const openScheduleMenu = () => {
    if (scheduleOpen) { setScheduleOpen(false); return; }
    {
      const today = new Date();
      today.setHours(18, 0, 0, 0);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      const nextMonday = new Date();
      const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
      nextMonday.setHours(9, 0, 0, 0);
      setLiveScheduleOptions([today, tomorrow, nextMonday].flatMap((date, index) => {
        const sendAtUtc = scheduledUtc(date.toISOString(), maxDelayedSend);
        return sendAtUtc ? [{ ...scheduleOptions[index], sendAtUtc }] : [];
      }));
      setScheduleInput("");
    }
    setScheduleOpen(true);
  };

  useEffect(() => {

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (sharedAccountId) params.set("accountId", sharedAccountId);
    else if (initial.fromAddress) params.set("fromAddress", initial.fromAddress);
    const query = params.size ? `?${params}` : "";
    fetch(`/api/mail/compose${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(response.status === 400 ? "invalid_request" : clientMailFailure(response.status, payload));
        if (!payload || typeof payload.from !== "string" || typeof payload.signature !== "string" ||
            typeof payload.signatureHtml !== "string" || !["text/plain", "text/html"].includes(payload.signatureFormat) ||
            !Number.isSafeInteger(payload.maxAttachmentBytes) ||
            !Number.isSafeInteger(payload.maxDelayedSend) || payload.maxDelayedSend < 0 ||
            !Array.isArray(payload.availableFrom) || !payload.availableFrom.every((item: unknown) => typeof item === "string")) throw new Error("unavailable");
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
          setMaxDelayedSend(payload.maxDelayedSend);
          if (!initial.previousDraftId && !initial.body && !bodyTouched.current && payload.signature) {
            const signatureBlock = `\n\n-- \n${payload.signature}`;
            setInsertedSignature(signatureBlock);
            setBody((current) => current ? current : signatureBlock);
            if (sendingDefaults.mode === "rich" && payload.signatureFormat === "text/html" && payload.signatureHtml.trim()) {
              const signatureHtmlBlock = `<div><br></div><div>-- </div>${payload.signatureHtml}`;
              setInsertedSignatureHtml(signatureHtmlBlock);
              setHtmlBody(signatureHtmlBlock);
            }
          }
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setComposeError(error instanceof Error ? error.message : "retryable");
      });
    return () => controller.abort();
  }, [mode, initial.body, initial.fromAddress, initial.previousDraftId, sharedAccountId, sendingDefaults.mode]);

  const hasContent =
    recipients.length > 0 ||
    subject.trim() ||
    (body.trim() && body !== insertedSignature) ||
    attachments.length > 0 ||
    recipientInput.trim() ||
    cc.trim() ||
    bcc.trim();
  const hasUnsavedChanges = initial.previousDraftId ? Boolean(recipientInput.trim()) || savedDraftChanged(
    { ...initial, to: parseRecipients(initial.to).map(recipient => recipient.label).join(", "), htmlBody: baselineHtml },
    { ...initial, fromAddress: initial.fromAddress ? fromAddress ?? initial.fromAddress : undefined,
      to: recipients.map(recipient => recipient.label).join(", "), cc, bcc, subject, body, htmlBody, attachments },
  ) : hasContent;
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
    const replyAll = initial.replyAll ? replyAllRecipients(to, ccAddrs, ownAddresses) : null;
    return {
      ...(sharedAccountId ? { accountId: sharedAccountId } : {}),
      to: replyAll?.to ?? to,
      cc: replyAll?.cc ?? ccAddrs,
      bcc: bccAddrs,
      fromAddress: fromAddress ?? undefined,
      subject, body,
      ...(htmlBody ? { htmlBody } : {}),
      inReplyTo: initial.inReplyTo ?? [],
      references: initial.references ?? [],
      ...(initial.previousDraftId ? { previousDraftId: initial.previousDraftId } : {}),
      attachments: attachments.map((attachment) => ({ blobId: attachment.blobId, name: attachment.name, type: attachment.type, size: attachment.size,
        ...(referencesInlineAttachment(htmlBody, attachment) ? { disposition: attachment.disposition, cid: attachment.cid } : {}) })),
    };
  };
  // Compare with the authenticated sender's domain.
  const senderDomain = fromAddress?.split("@").at(-1)?.toLowerCase();
  const isExternalRecipient = (address: string) => {
    const parts = address.trim().toLowerCase().split("@");
    return Boolean(senderDomain && parts.length === 2 && parts[0] && parts[1] && parts[1] !== senderDomain);
  };
  const pendingTo = recipientInput.split(/[,;\n]+/u).map((value) => value.trim()).filter(Boolean);
  const toAddresses = [...recipients.map((recipient) => recipient.label), ...pendingTo];
  const externalCount = [...toAddresses, ...ccAddrs, ...bccAddrs].filter(isExternalRecipient).length;

  const recipientQuery = recipientInput.split(/[,;\n]/u).at(-1)?.trim() ?? "";
  const visibleSuggestions = suggestionOpen && recipientQuery === suggestionResultQuery ? suggestions : [];

  useEffect(() => {
    if (recipientQuery.length < 2 || [...recipientQuery].length > 200) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: recipientQuery });
        const response = await fetch(`/api/mail/contact-suggestions?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(clientMailFailure(response.status, payload));
        if (!payload || !Array.isArray(payload.suggestions)) throw new Error("unavailable");
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

  const canSelectAttachments = Boolean(fromAddress && maxAttachmentBytes > 0 && !uploading && !submitting && !submissionUncertain);
  const addFiles = async (files: FileList | File[], inline = false): Promise<Attachment[]> => {
    if (!canSelectAttachments || ((uploadingRef.current || submittingRef.current || submissionUncertainRef.current || submissionCompletedRef.current))) return [];
    const incoming = Array.from(files);
    {
      if (inline && (attachments.filter((item) => item.disposition === "inline").length + incoming.length > MAX_INLINE_IMAGES ||
        incoming.some((file) => !RASTER_IMAGE.test(file.type) || file.size > MAX_INLINE_IMAGE_BYTES))) {
        setComposeError("invalid_request");
        return [];
      }
      const incomingBytes = incoming.reduce((total, file) => total + file.size, 0);
      const existingBytes = attachments.reduce((total, file) => total + file.size, 0);
      if (uploading || incoming.length + attachments.length > 20 || incomingBytes + existingBytes > maxAttachmentBytes) { setFailedUploadNames((current) => [...new Set([...current, ...incoming.map((file) => file.name)])]); setComposeError("invalid_request"); return []; }
      uploadingRef.current = true;
      setUploading(true);
      setComposeError(null);
      return Promise.allSettled(incoming.map(async (file): Promise<Attachment> => {
        if (!file.size || file.size > MAX_ATTACHMENT_BYTES) throw new Error("invalid_request");
        const uploadQuery = new URLSearchParams({ name: file.name });
        if (sharedAccountId) uploadQuery.set("accountId", sharedAccountId);
        const response = await fetch(`/api/mail/upload?${uploadQuery}`, {
          method: "POST", headers: { "content-type": file.type || "application/octet-stream" }, body: file,
          signal: AbortSignal.timeout(120_000),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(response.status === 413 ? "tooLarge" : response.status === 507 ? "overQuota" :
          response.status === 400 ? "invalid_request" : clientMailFailure(response.status, payload));
        const receipt = requireUploadReceipt(payload, file);
        return { id: `att-${crypto.randomUUID()}`, ...receipt, ext: file.name.split(".").pop()?.toLowerCase() ?? "",
          ...(inline ? { disposition: "inline" as const, cid: `${crypto.randomUUID()}@gxwebmail` } : {}) };
      })).then((results) => {
        const uploaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        if (uploaded.length) setAttachments((current) => [...current, ...uploaded]);
        const failed = results.find((result) => result.status === "rejected");
        setFailedUploadNames((current) => remainingFailedUploadNames(current, incoming.map((file) => file.name), results.map((result) => result.status)));
        if (failed?.status === "rejected") {
          const reason = failed.reason instanceof Error ? failed.reason.message : "unavailable";
          setComposeError(reason === "overQuota" ? "uploadOverQuota" : reason);
        }
        return uploaded;
      }).finally(() => { uploadingRef.current = false; setUploading(false); });
    }

  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (canSelectAttachments && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const submitLive = (sendAtUtc?: string, scheduleLabel?: string) => {
    if (submitting || submittingRef.current || uploading || uploadingRef.current || uploadFailed || !fromAddress || submissionUncertain || submissionUncertainRef.current || submissionCompletedRef.current) return;
    if (sendAtUtc && !scheduledUtc(sendAtUtc, maxDelayedSend)) { setComposeValidationField("sendAtUtc"); setComposeError("invalid_request"); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setComposeError(null);
    setComposeValidationField(null);
    void fetch("/api/mail/compose", {
      method: "POST", headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ action: "send", ...liveComposePayload(), ...(sendAtUtc ? { sendAtUtc } : {}) }),
    }).then(async (response) => {
      const payload = await requireConfirmedComposeMutation(response, "submitted");
      submissionCompletedRef.current = true;
      if (!sharedAccountId) retryLoad();
      if (sendAtUtc) refreshScheduledSubmissions();
      onSubmitted?.();
      const message = sendAtUtc ? t("scheduled") : t("queuedForSending");
      const detail = payload.previousDraftCleanupConfirmed === false ? t("oldDraftMayRemain") : scheduleLabel;
      toast.success(message, detail ? { sub: detail } : undefined);
      onClose();
    }).catch((error: unknown) => {
      setComposeValidationField(error instanceof ComposeValidationError ? error.field : null);
      const reason = error instanceof Error ? error.message : "submission_uncertain";
      if (reason === "draft_uncertain" || reason === "submission_rejected_draft_uncertain") {
        submissionUncertainRef.current = true;
        setSubmissionUncertain(true);
        setComposeError(reason);
      } else if (!["recipient_required", "invalid_request", "tooLarge", "overQuota", "unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)) {
        submissionUncertainRef.current = true;
        setSubmissionUncertain(true);
        setComposeError("submission_uncertain");
      } else setComposeError(reason);
    }).finally(() => { submittingRef.current = false; setSubmitting(false); });
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    { submitLive(); return; }

  };

  const handleClose = () => {
    if (submitting || submittingRef.current || uploading || uploadingRef.current) return;
    if (hasUnsavedChanges || submissionUncertain || uploadFailed) {
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
          autoComplete="off"
        onSubmit={handleSend}
        aria-busy={submitting}
        data-validation-field={composeError === "invalid_request" ? composeValidationField ?? undefined : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`relative flex h-full w-full flex-col overflow-hidden bg-background shadow-2xl transition-all sm:h-[min(88vh,760px)] sm:max-h-none sm:max-w-[calc(100vw-2rem)] sm:rounded-[14px] sm:border sm:border-(--border-app) ${
          expanded ? "sm:w-260" : "sm:w-190"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-(--border-app) px-4 py-3">
          <h2 id={titleId} className="text-sm font-bold tracking-tight">{initial.previousDraftId ? tReading("editDraft") : t("newMail")}</h2>
          {fromAddress ? <span className="truncate text-xs text-(--text-muted)">{fromAddress}</span> : null}
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
            <div className="flex items-center gap-3 border-b border-(--border-app) py-2.5">
              <span className="shrink-0 text-xs leading-5 font-semibold text-(--text-muted)">{t("to")}</span>
              <div className="relative flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-1.5">
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
                  role={"combobox"}
                  aria-autocomplete={"list"}
                  aria-controls={suggestionListId}
                  aria-expanded={visibleSuggestions.length > 0}
                  aria-activedescendant={visibleSuggestions.length > 0 ? `${suggestionListId}-${activeSuggestion}` : undefined}
                  // Chrome이 off를 무시하는 저장 주소 자동완성은 억제하고 앱 연락처 추천은 유지합니다.
                  autoComplete="section-compose-to new-password"
                  name="compose-recipient-to"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={recipientInput}
                  onChange={(e) => { setRecipientInput(e.target.value); setSuggestionOpen(false); setSuggestionError(null); }}
                  onFocus={() => { if (recipientQuery === suggestionResultQuery && suggestions.length > 0) setSuggestionOpen(true); }}
                  onKeyDown={handleRecipientKeyDown}
                  onBlur={() => { setSuggestionOpen(false); commitRecipientInput(); }}
                  placeholder={t("recipientPlaceholder")}
                  className="h-8 min-w-0 flex-1 basis-35 bg-transparent p-0 text-base leading-5 outline-none placeholder:text-(--text-muted) md:text-xs"
                />
                {suggestionOpen && recipientQuery === suggestionResultQuery && (visibleSuggestions.length > 0 || suggestionError) ? (
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
                className="inline-flex min-h-8 shrink-0 items-center text-[11.5px] leading-5 font-medium"
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
                    autoComplete="section-compose-cc new-password"
                    name="compose-recipient-cc"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
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
                    autoComplete="section-compose-bcc new-password"
                    name="compose-recipient-bcc"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
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

          {composeError ? <p role="alert" className="mx-4 mb-2 text-sm text-(--status-danger)">{composeError === "submission_uncertain" ? t("submissionUncertain") : composeError === "submission_rejected_draft_uncertain" ? t("submissionRejectedDraftUncertain") : composeError === "draft_uncertain" ? t("draftSaveUncertain") : composeError === "identityMismatch" ? t("identityMismatch") : composeError === "recipient_required" ? t("recipientRequired") : composeError === "invalid_request" ? t("invalidRequest") : composeError === "tooLarge" ? t("serverUploadTooLarge") : composeError === "uploadOverQuota" ? t("serverUploadOverQuota") : composeError === "overQuota" ? t("composeQuotaExceeded") : ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(composeError) ? tService(composeError as "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable") : tService("unavailable")}</p> : null}
          {uploadFailed ? <p role="alert" className="mx-4 mb-2 break-words text-sm text-(--status-danger)">{t("failedUploadsRemaining", { names: failedUploadNames.join(", ") })}</p> : null}
          {uploadFailed ? <button type="button" className="mx-4 mb-2 self-start text-sm font-semibold text-(--color-primary) underline underline-offset-2" onClick={() => { setFailedUploadNames([]); setComposeError(null); }}>{t("continueWithoutFailedUploads")}</button> : null}
          {null}

          {externalCount > 0 && (
            <div className="px-4 pb-1">
              <InlineBanner
                tone="warning"
                title={t("externalRecipientWarning", { count: numberFormatter.format(externalCount) })}
                body={t("externalRecipientBody")}
                actionLabel={t("reviewRecipients")}
                onAction={() => {
                  const toIsExternal = toAddresses.some(isExternalRecipient);
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

          <ComposeEditor
            initialMode={sendingDefaults.mode}
            value={body}
            initialHtml={initial.htmlBody ?? insertedSignatureHtml}
            inlineAttachments={attachments}
            inlineAccountId={sharedAccountId}
            onChange={(next) => { bodyTouched.current = true; setBody(next); }}
            onHtmlChange={(next) => {
              // 초기 HTML 정화는 사용자 수정이 아닙니다. 정화된 원본을 비교 기준으로 삼습니다.
              if (!bodyTouched.current) setBaselineHtml(next);
              setHtmlBody(next);
            }}
            onModeChange={() => { bodyTouched.current = true; }}
            placeholder={t("bodyPlaceholder")}
            onImageAttach={(file) => { void addFiles([file]); }}
            onInlineImageUpload={async (file) => {
              const [uploaded] = await addFiles([file], true);
              return uploaded?.cid ?? null;
            }}
            allowInlineImages={false}
            imageAttachDisabled={!canSelectAttachments}
          />

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
                          {""}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={referencesInlineAttachment(htmlBody, att)}
                        onClick={() => removeAttachment(att.id)}
                        className="shrink-0 text-(--text-muted) hover:text-(--status-danger) disabled:cursor-not-allowed disabled:opacity-40"
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
              onClick={() => { if (canSelectAttachments) fileInputRef.current?.click(); }}
              onDragOver={(e) => {
                e.preventDefault();
                if (canSelectAttachments) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              role="button"
              aria-disabled={!canSelectAttachments}
              tabIndex={canSelectAttachments ? 0 : -1}
              onKeyDown={(e) => {
                if (canSelectAttachments && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label={t("chooseAttachments")}
              className={`flex shrink-0 items-center gap-2.5 rounded-[10px] border border-dashed px-3 py-2 outline-none transition focus-visible:ring-2 focus-visible:ring-(--focus-ring) sm:w-55 ${canSelectAttachments ? "cursor-pointer" : "cursor-not-allowed opacity-50"} ${
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
                  {null}
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={!canSelectAttachments}
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
                disabled={(submitting || uploading || uploadFailed || !fromAddress || submissionUncertain)}
                className="min-h-11 px-4 text-[13px] font-semibold text-white transition hover:brightness-110 sm:min-h-0 sm:py-2"
              >
                {submitting ? t("sendingNow") : t("send")}
              </button>
              {(maxDelayedSend > 0) ? <span className="h-4 w-px bg-white/30" /> : null}
              {(maxDelayedSend > 0) ? <>
              <button
                ref={scheduleButtonRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={scheduleOpen}
                disabled={(submitting || uploading || uploadFailed || !fromAddress || submissionUncertain)}
                onClick={openScheduleMenu}
                className="flex min-h-11 items-center gap-1 px-2.5 text-[11px] font-medium text-white/90 transition hover:brightness-110 disabled:opacity-45 sm:min-h-0 sm:py-2"
              >
                <Clock size={12} />
                {t("scheduleSend")}
              </button>
              </> : null}
            </div>
            {scheduleOpen && (
              <>
                <button type="button" tabIndex={-1} aria-label={t("closeScheduleMenu")} className="fixed inset-0 z-(--layer-popover-backdrop) cursor-default" onClick={() => { setScheduleOpen(false); scheduleButtonRef.current?.focus(); }} />
                <div ref={scheduleMenuRef} role="group" aria-label={t("scheduleTimes")} className="absolute bottom-full left-0 z-(--layer-popover) mb-2 w-64 overflow-hidden rounded-[10px] border border-(--border-app) bg-background py-1 text-foreground shadow-xl">
                  {(liveScheduleOptions).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setScheduleOpen(false);
                        { if (option.sendAtUtc) submitLive(option.sendAtUtc, option.label); return; }

                      }}
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {option.label}
                    </button>
                  ))}
                  {<div className="space-y-2 border-t border-(--border-app) p-3">
                    <input type="datetime-local" aria-label={t("scheduleSend")} value={scheduleInput} onChange={(event) => setScheduleInput(event.target.value)}
                      className="min-h-11 w-full rounded-lg border border-(--border-app) bg-background px-2 text-sm text-foreground" />
                    <button type="button" disabled={!scheduledUtc(scheduleInput, maxDelayedSend)} onClick={() => {
                      const sendAtUtc = scheduledUtc(scheduleInput, maxDelayedSend);
                      if (!sendAtUtc) { setComposeError("invalid_request"); return; }
                      setScheduleOpen(false);
                      submitLive(sendAtUtc, new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(sendAtUtc)));
                    }} className="min-h-11 w-full rounded-lg bg-(--color-primary-solid) px-3 text-sm font-semibold text-white disabled:opacity-45">{t("scheduleSend")}</button>
                  </div>}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canSelectAttachments}
              className="flex size-11 items-center justify-center rounded-lg text-(--text-muted) outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10 sm:size-auto sm:p-1.5"
              aria-label={t("attachFile")}
              title={t("attachFile")}
            >
              <Paperclip size={15} />
            </button>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {null}
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
          confirmDisabled={(submitting || uploading || uploadFailed || !fromAddress || submissionUncertain)}
          onCancel={() => {
            if (submitting || submittingRef.current || uploading || uploadingRef.current) return;
            setConfirmingDiscard(false);
          }}
          middleAction={{
            label: t("discardWithoutSaving"),
            onClick: () => {
              if (submitting || submittingRef.current || uploading || uploadingRef.current) return;
              setConfirmingDiscard(false);
              onClose();
            },
          }}
          onConfirm={() => {
            {
              if (submitting || submittingRef.current || uploading || uploadingRef.current || uploadFailed || !fromAddress || submissionUncertain || submissionUncertainRef.current || submissionCompletedRef.current) return;
              submittingRef.current = true;
              setSubmitting(true);
              setComposeError(null);
              setComposeValidationField(null);
              void fetch("/api/mail/compose", {
                method: "POST", headers: { "content-type": "application/json" },
                signal: AbortSignal.timeout(60_000),
                body: JSON.stringify({ action: "draft", ...liveComposePayload() }),
              }).then(async (response) => {
                const payload = await requireConfirmedComposeMutation(response, "saved");
                submissionCompletedRef.current = true;
                if (!sharedAccountId) retryLoad();
                onSubmitted?.();
                setConfirmingDiscard(false);
                toast.info(t("draftSaved"), payload.previousDraftCleanupConfirmed === false ? { sub: t("oldDraftMayRemain") } : undefined);
                onClose();
              }).catch((error: unknown) => {
                setConfirmingDiscard(false);
                setComposeValidationField(error instanceof ComposeValidationError ? error.field : null);
                const reason = error instanceof Error ? error.message : "draft_uncertain";
                if (["invalid_request", "tooLarge", "overQuota", "unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)) {
                  setComposeError(reason);
                } else {
                  submissionUncertainRef.current = true;
                  setSubmissionUncertain(true);
                  setComposeError("draft_uncertain");
                }
              })
                .finally(() => { submittingRef.current = false; setSubmitting(false); });
              return;
            }

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

export function SharedComposeModal({ accountId, initial, onClose, onSubmitted }: { accountId: string; initial?: ComposeDraft | null; onClose: () => void; onSubmitted: () => void }) {
  return <ComposeForm initial={initial ?? { to: "", subject: "", body: "" }} onClose={onClose} onSubmitted={onSubmitted} sharedAccountId={accountId} />;
}
