"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, Reply, ReplyAll, Forward, Pencil, Trash2, Star, Mail, MailOpen } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { useSettings } from "@/context/settings-context";
import { replyQuote } from "@/lib/sending-settings";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { FOLDERS } from "@/lib/mail-folders";
import { Dropdown } from "@/components/ui/Dropdown";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTheme } from "@/context/theme-context";

import { useFullMailTimestamp } from "./useMailTimestamp";
import { InviteCard } from "./InviteCard";
import { InviteAttendees } from "./InviteAttendees";
import { LiveHtmlMessageBody } from "./LiveHtmlMessageBody";
import { MailDeliveryDetails } from "./MailDeliveryDetails";
import { draftRequiresPlainTextConfirmation, forwardedMailContent } from "@/lib/mail-draft";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useState } from "react";
import type { LayoutStyle } from "@/types/theme";
import type { Email } from "@/types/mail";

// Right-hand pane that shows the selected email and its reply/forward/star/
// delete actions. Visual style (padding, background) follows the active
// layout preset from the theme customizer.
const WRAPPER_STYLE: Record<LayoutStyle, string> = {
  classic: "bg-background",
  card: "bg-(--surface-muted)",
  minimal: "bg-background",
};

const ACTION_BAR_STYLE: Record<LayoutStyle, string> = {
  classic: "border-b border-(--border-app)",
  card: "",
  minimal: "border-b border-(--border-app)",
};

const CONTENT_STYLE: Record<LayoutStyle, string> = {
  classic: "px-4 py-5 sm:px-8",
  card: "m-4 rounded-(--radius-app) bg-background p-5 shadow-sm sm:m-6 sm:p-8",
  minimal: "px-6 py-8 sm:px-12",
};

const SUBJECT_STYLE: Record<LayoutStyle, string> = {
  classic: "bg-background px-4 pt-5 pb-4 sm:px-8",
  card: "mx-4 mt-4 rounded-t-(--radius-app) bg-background px-5 pt-5 pb-4 sm:mx-6 sm:mt-6 sm:px-8 sm:pt-8",
  minimal: "bg-background px-6 pt-8 pb-4 sm:px-12",
};

export function ReadingPane({ onBack, source }: { onBack?: () => void; source?: {
  message: Email; status: ReturnType<typeof useMail>["detailStatus"]; retry: () => void;
} }) {
  const t = useTranslations("readingPane");
  const tList = useTranslations("mailList");
  const tFolder = useTranslations("sidebar");
  const tCompose = useTranslations("composeModal");
  const tService = useTranslations("liveService");
  const formatMailTimestamp = useFullMailTimestamp();
  const { selectedEmail: mailboxEmail, detailStatus: mailboxDetailStatus, retryDetail: retryMailboxDetail, setRead, toggleStar, moveToTrash, moveToFolder, moveToCustomMailbox, mailboxes, activeCustomMailboxId, permanentlyDelete, openCompose, accountAddress, mutationStatus, pendingMutationIds, uncertainMutationIds, pageTransitionPending } = useMail();
  const selectedEmail = source ? source.message : mailboxEmail;
  const detailStatus = source ? source.status : mailboxDetailStatus;
  const retryDetail = source ? source.retry : retryMailboxDetail;
  const { draft } = useTheme();
  const { saved: preferences } = useSettings();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingPlainTextEdit, setConfirmingPlainTextEdit] = useState(false);
  const style = draft.layoutStyle;

  if (!selectedEmail) {
    return (
      <div
        className={`hidden h-full w-full flex-1 flex-col items-center justify-center gap-2 text-(--text-muted) lg:flex ${WRAPPER_STYLE[draft.layoutStyle]}`}
      >
        <Mail size={40} strokeWidth={1.5} />
        <p className="text-sm">{t("selectPrompt")}</p>
      </div>
    );
  }

  if (selectedEmail.detailLoaded === false) {
    const detailError = detailStatus !== "loading" && detailStatus !== "ready";
    return <article aria-labelledby="message-subject" className={`flex h-full w-full flex-1 flex-col ${WRAPPER_STYLE[style]}`}>
      {onBack ? <header className={`flex h-12 shrink-0 items-center px-4 py-0 ${ACTION_BAR_STYLE[style]}`}>
        <Tooltip content={t("back")} side="bottom" className={source ? "" : "lg:hidden"}><button type="button" onClick={onBack} className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label={t("back")}><ArrowLeft size={18} /></button></Tooltip>
      </header> : null}
      <div className={CONTENT_STYLE[style]}>
        <h1 id="message-subject" className="mb-4 text-xl font-semibold leading-snug sm:text-2xl">{selectedEmail.subject || tList("noSubject")}</h1>
        {detailError ? <SystemErrorNotice message={tService(detailStatus)} actionLabel={tService("retry")} onAction={retryDetail} /> : <p role="status" className="text-sm text-(--text-muted)">{tService("loading")}</p>}
      </div>
    </article>;
  }

  const email = selectedEmail;
  const subject = email.subject || tList("noSubject");
  // Reply/reply-all/forward all pre-fill the compose body with the original
  // message quoted below a blank line, Gmail-style.
  const quoted = replyQuote(`${t("originalMessageHeader")}\n${email.from.name} <${email.from.email}>\n${email.bodyText ?? email.body.join("\n")}`, preferences.sending.quoteStyle);
  const parentMessageId = email.messageId?.at(-1);
  const replyHeaders = parentMessageId ? {
    inReplyTo: [parentMessageId],
    references: [...new Set([...(email.references ?? []), parentMessageId])].slice(-100),
  } : {};
  const otherRecipients = (addresses: string[]) => [...new Map(addresses
    .filter((address) => address && address.toLowerCase() !== accountAddress?.toLowerCase())
    .map((address) => [address.toLowerCase(), address])).values()];
  const replyAddress = email.replyTo || email.from.email;
  const ownedReplyAddress = (email.folder === "sent" ||
    replyAddress.toLowerCase() === accountAddress?.toLowerCase());
  const replyRecipient = ownedReplyAddress
    ? otherRecipients(email.to)[0] || replyAddress
    : replyAddress;
  const replyAllTo = [replyRecipient];
  const replyAllCc = otherRecipients([...email.to, ...(email.cc ?? [])])
    .filter((address) => !replyAllTo.some((to) => to.toLowerCase() === address.toLowerCase()));
  const editingDraft = email.folder === "drafts";

  const handleEditDraft = (asPlainText = false) => {
    openCompose({
      fromAddress: email.from.email,
      to: email.to.join(", "),
      cc: (email.cc ?? []).join(", "),
      bcc: (email.bcc ?? []).join(", "),
      subject: email.subject,
      body: email.bodyText ?? email.body.join("\n\n"),
      htmlBody: asPlainText ? null : email.htmlBody,
      inReplyTo: email.inReplyTo ?? [],
      references: email.references ?? [],
      attachments: (email.attachments ?? []).map(({ blobId, name, type, size, disposition, cid }) => ({ blobId, name, type, size, disposition, cid })),
      previousDraftId: email.id,
    });
  };

  const handleReply = () => {
    openCompose({
      to: replyRecipient,
      subject: email.subject.startsWith("RE:")
        ? email.subject
        : `RE: ${subject}`,
      body: quoted,
      ...(replyHeaders),
    });
  };

  const handleReplyAll = () => {
    openCompose({
      to: replyAllTo.join(", "),
      cc: replyAllCc.join(", "),
      subject: email.subject.startsWith("RE:")
        ? email.subject
        : `RE: ${subject}`,
      body: quoted,
      ...({ ...replyHeaders, replyAll: true }),
    });
  };

  const handleForward = () => {
    openCompose({
      to: "",
      subject: email.subject.startsWith("FWD:")
        ? email.subject
        : `FWD: ${subject}`,
      ...(forwardedMailContent(email, t("originalMessageHeader"))),
    });
  };

  const handleDelete = () => {
    if (email.folder === "trash") {
      setConfirmingDelete(true);
      return;
    }
    { moveToTrash(email.id); return; }

  };

  return (
    <article aria-labelledby="message-subject" className={`flex h-full w-full flex-1 flex-col ${WRAPPER_STYLE[style]}`}>
      <header
        inert={!source && pageTransitionPending}
        className={`flex h-12 shrink-0 items-center gap-2 px-4 py-0 ${ACTION_BAR_STYLE[style]}`}
      >
        {onBack && (
          <Tooltip content={t("back")} side="bottom" className={source ? "" : "lg:hidden"}>
          <button
            type="button"
            onClick={onBack}
            className={`rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10 ${source ? "" : "lg:hidden"}`}
            aria-label={t("back")}
          >
            <ArrowLeft size={18} />
          </button>
          </Tooltip>
        )}
        <div className="flex flex-1 items-center gap-1">
          {editingDraft ? (
          <Tooltip content={t("editDraft")} side="bottom">
          <button
            type="button"
            onClick={() => {
              if (email.htmlBody && draftRequiresPlainTextConfirmation(email.htmlBody, email.attachments)) setConfirmingPlainTextEdit(true);
              else handleEditDraft();
            }}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t("editDraft")}
          >
            <Pencil size={18} />
          </button>
          </Tooltip>
          ) : null}
          {!editingDraft ? <>
          <Tooltip content={t(preferences.sending.defaultReply === "replyAll" ? "replyAll" : "reply")} side="bottom">
          <button
            type="button"
            disabled={!replyRecipient}
            onClick={preferences.sending.defaultReply === "replyAll" ? handleReplyAll : handleReply}
            data-mail-shortcut="reply"
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t(preferences.sending.defaultReply === "replyAll" ? "replyAll" : "reply")}
          >
            {preferences.sending.defaultReply === "replyAll" ? <ReplyAll size={18} /> : <Reply size={18} />}
          </button>
          </Tooltip>
          <Tooltip content={t(preferences.sending.defaultReply === "replyAll" ? "reply" : "replyAll")} side="bottom">
          <button
            type="button"
            disabled={!replyRecipient}
            onClick={preferences.sending.defaultReply === "replyAll" ? handleReply : handleReplyAll}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t(preferences.sending.defaultReply === "replyAll" ? "reply" : "replyAll")}
          >
            {preferences.sending.defaultReply === "replyAll" ? <Reply size={18} /> : <ReplyAll size={18} />}
          </button>
          </Tooltip>
          <Tooltip content={t("forward")} side="bottom">
          <button
            type="button"
            disabled={(email.attachments?.length ?? 0) > 20}
            onClick={handleForward}
            data-mail-shortcut="forward"
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t("forward")}
          >
            <Forward size={18} />
          </button>
          </Tooltip>
          </> : null}
          <Tooltip content={tList(email.unread ? "markRead" : "markUnread")} side="bottom">
          <button
            type="button"
            disabled={!!source || pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id)}
            onClick={() => setRead(email.id, email.unread)}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={tList(email.unread ? "markRead" : "markUnread")}
          >
            {email.unread ? <MailOpen size={18} /> : <Mail size={18} />}
          </button>
          </Tooltip>
          <Tooltip content={tList("markImportant")} side="bottom">
          <button
            type="button"
            disabled={!!source || pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id)}
            onClick={() => toggleStar(email.id)}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={tList("markImportant")}
          >
            <Star
              size={18}
              fill={email.starred ? "var(--color-accent)" : "none"}
              color={email.starred ? "var(--color-accent)" : "currentColor"}
            />
          </button>
          </Tooltip>
          <Tooltip content={tList("delete")} side="bottom">
          <button
            type="button"
            onClick={handleDelete}
            data-mail-shortcut="delete"
            disabled={!!source || pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id)}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={tList("delete")}
          >
            <Trash2 size={18} />
          </button>
          </Tooltip>
          {(
            <Tooltip content={tList("moveToFolder")} side="bottom" className="ml-auto hidden shrink-0 lg:inline-flex"><Dropdown
              value=""
              label={tList("moveToFolder")}
              className="shrink-0"
              options={[
                { value: "", label: tList("moveToFolder"), disabled: true },
                ...FOLDERS.filter((folder) => folder.id !== email.folder && ["inbox", "archive", "spam", "trash"].includes(folder.id))
                  .map((folder) => ({ value: `folder:${folder.id}`, label: tFolder(folder.id) })),
                ...mailboxes.filter((mailbox) => mailbox.role === null && mailbox.id !== activeCustomMailboxId)
                  .map((mailbox) => ({ value: `custom:${mailbox.id}`, label: mailbox.name })),
              ]}
              onChange={(value) => {
                if (value.startsWith("custom:")) moveToCustomMailbox(email.id, value.slice(7));
                else if (value.startsWith("folder:")) moveToFolder(email.id, value.slice(7) as typeof email.folder);
              }}
              disabled={!!source || pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id)}
            /></Tooltip>
          )}
        </div>
      </header>

      {!source && (mutationStatus || uncertainMutationIds.includes(email.id)) ? (
        <SystemErrorNotice message={uncertainMutationIds.includes(email.id) ? tService("mutationUncertain") : tService(mutationStatus!)} className="border-b border-(--border-app) px-4 py-2 text-xs text-(--status-danger)" />
      ) : null}

      <div className={`shrink-0 ${SUBJECT_STYLE[style]}`}>
        <h1 id="message-subject" className="text-xl font-semibold leading-snug wrap-anywhere sm:text-2xl">{subject}</h1>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={`min-w-0 flex-1 overflow-y-auto ${CONTENT_STYLE[style]} ${style === "card" ? "mt-0 rounded-t-none pt-0 sm:mt-0 sm:pt-0" : "pt-0"}`}>

          <div className="mb-6 flex flex-wrap items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--color-primary-solid)" }}
            >
              {email.from.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{email.from.name}</p>
              <p className="truncate text-xs text-(--text-muted)">
                {email.from.email} · {email.to.join(", ")}
              </p>
              {email.cc && email.cc.length > 0 && (
                <p className="truncate text-xs text-(--text-muted)">{t("cc", { list: email.cc.join(", ") })}</p>
              )}
              <MailDeliveryDetails key={email.id} message={email} />
            </div>
            <time dateTime={email.receivedAt} className="ml-auto w-full shrink-0 text-right text-xs tabular-nums text-(--text-muted) sm:w-auto">
              {formatMailTimestamp(email.receivedAt)}
            </time>
          </div>

          {email.invite && <InviteCard invite={email.invite} />}

          {email.htmlBody ? <LiveHtmlMessageBody key={email.id} html={email.htmlBody} subject={subject}
            senderEmail={email.from.email} blockedExternalImages={email.blockedExternalImages} attachments={email.attachments} /> :
            <div className="max-w-2xl space-y-4 text-sm leading-relaxed whitespace-pre-line">
              {email.body.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            </div>}
          {email.attachments && email.attachments.length > 0 ? (
            <section className="mt-6 max-w-2xl border-t border-(--border-app) pt-4" aria-label={tCompose("attachmentCount", { count: email.attachments.length })}>
              <h2 className="text-sm font-semibold">{tCompose("attachmentCount", { count: email.attachments.length })}</h2>
              <ul className="mt-2 space-y-1 text-sm text-(--text-muted)">
                {email.attachments.map((attachment) => (
                  <li key={attachment.blobId}>
                    {(
                      <a href={`/api/mail/attachments?blobId=${encodeURIComponent(attachment.blobId)}`} className="font-medium text-(--color-primary) underline-offset-2 hover:underline focus-visible:underline">
                        {attachment.name}
                      </a>
                    )}
                    {" · "}{new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(attachment.size / 1024)} KiB
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {email.invite && <InviteAttendees invite={email.invite} />}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          tone="destructive"
          title={tList("confirmPermDeleteTitle")}
          description={tList("confirmPermDeleteDesc")}
          confirmLabel={tList("permanentDelete")}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            permanentlyDelete(email.id);

          }}
        />
      )}
      {confirmingPlainTextEdit && (
        <ConfirmDialog
          tone="warning"
          title={t("editDraftAsTextTitle")}
          description={t("editDraftAsTextDescription")}
          confirmLabel={t("editDraft")}
          onCancel={() => setConfirmingPlainTextEdit(false)}
          onConfirm={() => {
            setConfirmingPlainTextEdit(false);
            handleEditDraft(true);
          }}
        />
      )}
    </article>
  );
}
