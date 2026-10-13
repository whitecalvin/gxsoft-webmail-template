import type { ComposeDraft, Email } from "@/types/mail";

/** Editor-only attachment IDs and address spacing are not persisted draft changes. */
type DraftComparison = Omit<ComposeDraft, "attachments"> & {
  attachments?: Array<{ blobId?: string; name: string; type?: string; size: number; disposition?: "attachment" | "inline"; cid?: string | null }>;
};
export function savedDraftChanged(initial: DraftComparison, current: DraftComparison): boolean {
  const addresses = (value?: string) => (value ?? "").split(/[,;\n]+/u).map(item => item.trim()).filter(Boolean);
  const snapshot = (draft: DraftComparison) => JSON.stringify({
    from: draft.fromAddress?.trim().toLowerCase() ?? "", to: addresses(draft.to), cc: addresses(draft.cc), bcc: addresses(draft.bcc),
    subject: draft.subject, body: draft.body, html: draft.htmlBody ?? null,
    attachments: (draft.attachments ?? []).map(file => ({ blobId: file.blobId ?? null, name: file.name, type: file.type, size: file.size,
      disposition: file.disposition ?? "attachment", cid: file.cid ?? null })),
  });
  return snapshot(initial) !== snapshot(current);
}

/** The compose editor sanitizes this HTML before inserting it into its editable DOM. */
export function forwardedMailContent(email: Email, originalMessageHeader: string): Pick<ComposeDraft, "body" | "htmlBody" | "attachments"> {
  const header = `${originalMessageHeader}\n${email.from.name} <${email.from.email}>`;
  const body = `\n\n${header}\n${email.bodyText ?? email.body.join("\n")}`;
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return {
    body,
    ...(email.htmlBody ? { htmlBody: `<div><br></div><div><br></div><div>${escape(header).replace(/\n/g, "<br>")}</div><blockquote>${email.htmlBody}</blockquote>` } : {}),
    attachments: (email.attachments ?? []).map(({ blobId, name, type, size, disposition, cid }) => ({ blobId, name, type, size, disposition, cid })),
  };
}

export function draftRequiresPlainTextConfirmation(html: string, attachments: Email["attachments"]): boolean {
  const source = document.createElement("template");
  source.innerHTML = html;
  if (source.content.querySelector("audio, embed, iframe, object, picture, source, svg, video")) return true;
  return Array.from(source.content.querySelectorAll("img")).some((image) => {
    const src = image.getAttribute("src");
    if (!src || !/^cid:[^\s<>"']+$/iu.test(src)) return true;
    const cid = src.slice(4).toLowerCase();
    return !attachments?.some((attachment) => attachment.disposition === "inline" &&
      attachment.cid?.toLowerCase() === cid && attachment.type.toLowerCase().startsWith("image/"));
  });
}
