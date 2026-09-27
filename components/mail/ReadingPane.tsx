"use client";

import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Star,
  Mail,
} from "lucide-react";
import { useMail } from "@/context/mail-context";
import { useTheme } from "@/context/theme-context";
import { useToast } from "@/context/toast-context";
import { useMailTimestamp } from "./useMailTimestamp";
import { InviteCard } from "./InviteCard";
import { InviteAttendees } from "./InviteAttendees";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useState } from "react";
import type { LayoutStyle } from "@/types/theme";

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

export function ReadingPane({ onBack }: { onBack?: () => void }) {
  const t = useTranslations("readingPane");
  const tList = useTranslations("mailList");
  const formatMailTimestamp = useMailTimestamp();
  const { selectedEmail, toggleStar, moveToTrash, moveToFolder, permanentlyDelete, openCompose } =
    useMail();
  const { draft } = useTheme();
  const toast = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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

  const email = selectedEmail;
  const subject = email.subject || tList("noSubject");
  // Reply/reply-all/forward all pre-fill the compose body with the original
  // message quoted below a blank line, Gmail-style.
  const quoted = `\n\n${t("originalMessageHeader")}\n${email.from.name} <${email.from.email}>\n${email.body.join("\n")}`;

  const handleReply = () => {
    openCompose({
      to: email.from.email,
      subject: email.subject.startsWith("RE:")
        ? email.subject
        : `RE: ${subject}`,
      body: quoted,
    });
  };

  const handleReplyAll = () => {
    openCompose({
      to: [email.from.email, ...email.to].join(", "),
      subject: email.subject.startsWith("RE:")
        ? email.subject
        : `RE: ${subject}`,
      body: quoted,
    });
  };

  const handleForward = () => {
    openCompose({
      to: "",
      subject: email.subject.startsWith("FWD:")
        ? email.subject
        : `FWD: ${subject}`,
      body: quoted,
    });
  };

  const handleDelete = () => {
    if (email.folder === "trash") {
      setConfirmingDelete(true);
      return;
    }
    const previousFolder = email.folder;
    moveToTrash(email.id);
    onBack?.();
    toast.undo(tList("movedToTrash"), () => moveToFolder(email.id, previousFolder));
  };

  return (
    <article aria-labelledby="message-subject" className={`flex h-full w-full flex-1 flex-col ${WRAPPER_STYLE[style]}`}>
      <header
        className={`flex items-center gap-2 px-4 py-2.5 ${ACTION_BAR_STYLE[style]}`}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10 lg:hidden"
            aria-label={t("back")}
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="flex flex-1 items-center gap-1">
          <button
            type="button"
            onClick={handleReply}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t("reply")}
          >
            <Reply size={18} />
          </button>
          <button
            type="button"
            onClick={handleReplyAll}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t("replyAll")}
          >
            <ReplyAll size={18} />
          </button>
          <button
            type="button"
            onClick={handleForward}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t("forward")}
          >
            <Forward size={18} />
          </button>
          <button
            type="button"
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
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={tList("delete")}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className={`flex-1 overflow-y-auto ${CONTENT_STYLE[style]}`}>
          <h1 id="message-subject" className="mb-4 text-xl font-semibold leading-snug sm:text-2xl">
            {subject}
          </h1>

          <div className="mb-6 flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--color-primary-solid)" }}
            >
              {email.from.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{email.from.name}</p>
              <p className="truncate text-xs text-(--text-muted)">
                {email.from.email} · {email.to.join(", ")}
              </p>
              {email.cc && email.cc.length > 0 && (
                <p className="truncate text-xs text-(--text-muted)">{t("cc", { list: email.cc.join(", ") })}</p>
              )}
            </div>
            <span className="ml-auto shrink-0 text-xs text-(--text-muted)">
              {formatMailTimestamp(email.receivedAt)}
            </span>
          </div>

          {email.invite && <InviteCard invite={email.invite} />}

          <div className="max-w-2xl space-y-4 text-sm leading-relaxed whitespace-pre-line">
            {email.body.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
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
            onBack?.();
            toast.success(tList("permanentlyDeleted"));
          }}
        />
      )}
    </article>
  );
}
