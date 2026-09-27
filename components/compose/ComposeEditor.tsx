"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Bold, Image as ImageIcon, Italic, Link2, List, Smile, Type } from "lucide-react";
import { useToast } from "@/context/toast-context";

const EMOJI_OPTIONS = ["👍", "🙏", "✅", "🎉", "😊", "🚀", "📎", "❗"];

// Compose body editor with two modes sharing one toolbar:
//  - "plain": a <textarea>; formatting buttons insert Markdown-style
//    characters (**bold**, _italic_) around the selection.
//  - "rich": a contentEditable <div> driven by the deprecated but still
//    universally-supported `document.execCommand` API for real bold/italic/
//    list/image formatting.
// `value`/`onChange` always carry plain text — rich mode's HTML is
// converted to `.innerText` on every edit, so the parent (and the sent
// email body) never has to deal with markup.
export type ComposeEditorMode = "plain" | "rich";

interface ComposeEditorProps {
  value: string;
  onChange: (plainText: string) => void;
  placeholder?: string;
  onImageAttach?: (file: File) => void;
}

function plainToHtml(text: string) {
  return text
    .split("\n")
    .map((line) => `<div>${line.length ? escapeHtml(line) : "<br>"}</div>`)
    .join("");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ComposeEditor({ value, onChange, placeholder, onImageAttach }: ComposeEditorProps) {
  const t = useTranslations("composeEditor");
  const toast = useToast();
  const [mode, setMode] = useState<ComposeEditorMode>("plain");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const plainRef = useRef<HTMLTextAreaElement>(null);
  const richRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  const switchMode = (next: ComposeEditorMode) => {
    if (next === mode) return;
    // Switching to plain text is lossy — rich formatting has no plain-text
    // equivalent, so warn before discarding it.
    if (next === "plain" && mode === "rich") {
      toast.info(t("switchingToPlain"), { sub: t("formattingWillBeLost") });
    }
    setMode(next);
    requestAnimationFrame(() => {
      if (next === "rich" && richRef.current) {
        richRef.current.innerHTML = plainToHtml(value);
        richRef.current.focus();
      } else if (next === "plain") {
        plainRef.current?.focus();
      }
    });
  };

  const wrapSelection = (before: string, after: string) => {
    const el = plainRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value: v } = el;
    const selected = v.slice(selectionStart, selectionEnd);
    const next = v.slice(0, selectionStart) + before + selected + after + v.slice(selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = selectionStart + before.length;
      el.selectionEnd = selectionStart + before.length + selected.length;
    });
  };

  const insertAtCursor = (text: string) => {
    const el = plainRef.current;
    if (!el) {
      onChange(value + text);
      return;
    }
    const { selectionStart, selectionEnd, value: v } = el;
    const next = v.slice(0, selectionStart) + text + v.slice(selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = selectionStart + text.length;
      el.selectionStart = pos;
      el.selectionEnd = pos;
    });
  };

  const prefixLines = (prefix: string) => {
    const el = plainRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value: v } = el;
    const lineStart = v.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIdx = v.indexOf("\n", selectionEnd);
    const lineEnd = lineEndIdx === -1 ? v.length : lineEndIdx;
    const block = v.slice(lineStart, lineEnd);
    const prefixed = block
      .split("\n")
      .map((line) => (line.startsWith(prefix) ? line : prefix + line))
      .join("\n");
    onChange(v.slice(0, lineStart) + prefixed + v.slice(lineEnd));
    requestAnimationFrame(() => el.focus());
  };

  const richExec = (command: string, arg?: string) => {
    richRef.current?.focus();
    document.execCommand(command, false, arg);
    if (richRef.current) onChange(richRef.current.innerText);
  };

  const handleBold = () => (mode === "rich" ? richExec("bold") : wrapSelection("**", "**"));
  const handleItalic = () => (mode === "rich" ? richExec("italic") : wrapSelection("_", "_"));
  const handleList = () => (mode === "rich" ? richExec("insertUnorderedList") : prefixLines("- "));
  const handleLink = () =>
    mode === "rich"
      ? richExec("insertHTML", `<a href="https://" style="color:var(--color-primary)">https://</a>`)
      : insertAtCursor("https://");
  const handleEmoji = (em: string) => {
    setEmojiOpen(false);
    if (mode === "rich") richExec("insertText", em);
    else insertAtCursor(em);
  };

  const handleImageFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (mode === "rich") {
      const reader = new FileReader();
      reader.onload = () => {
        richExec("insertImage", String(reader.result));
      };
      reader.readAsDataURL(file);
    } else {
      onImageAttach?.(file);
      toast.info(t("imageAddedAsAttachment"), { sub: file.name });
    }
  };

  useEffect(() => {
    if (mode === "rich" && richRef.current && richRef.current.innerText !== value && document.activeElement !== richRef.current) {
      richRef.current.innerHTML = plainToHtml(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const toolbarBtn = "flex size-11 shrink-0 items-center justify-center rounded-lg text-(--text-muted) outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:hover:bg-white/10 sm:size-auto sm:p-1.5";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-y border-(--border-app) bg-(--surface-muted) px-3 py-1.5">
        <button
          type="button"
          onClick={() => switchMode(mode === "plain" ? "rich" : "plain")}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold text-(--text-muted) outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:hover:bg-white/10 sm:mr-1 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-2 sm:py-1"
          aria-label={mode === "plain" ? t("switchToRich") : t("switchToPlain")}
          title={mode === "plain" ? t("switchToRich") : t("switchToPlain")}
        >
          <Type size={13} />
          <span className="hidden sm:inline">{mode === "plain" ? t("plainText") : t("richText")}</span>
        </button>
        <span className="mx-1 hidden h-4 w-px bg-(--border-app) sm:block" />
        <button type="button" onClick={handleBold} className={toolbarBtn} aria-label={t("bold")} title={t("bold")}>
          <Bold size={14} />
        </button>
        <button type="button" onClick={handleItalic} className={toolbarBtn} aria-label={t("italic")} title={t("italic")}>
          <Italic size={14} />
        </button>
        <button type="button" onClick={handleList} className={toolbarBtn} aria-label={t("list")} title={t("list")}>
          <List size={14} />
        </button>
        <button type="button" onClick={handleLink} className={toolbarBtn} aria-label={t("insertLink")} title={t("insertLink")}>
          <Link2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          className={toolbarBtn}
          aria-label={t("insertImage")}
          title={t("insertImage")}
        >
          <ImageIcon size={14} />
        </button>
        <div
          className="relative"
          onKeyDown={(event) => {
            if (emojiOpen && event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setEmojiOpen(false);
              emojiButtonRef.current?.focus();
            }
          }}
        >
          <button ref={emojiButtonRef} type="button" onClick={() => setEmojiOpen((v) => !v)} className={toolbarBtn} aria-label={t("emoji")} aria-haspopup="true" aria-expanded={emojiOpen} title={t("emoji")}>
            <Smile size={14} />
          </button>
          {emojiOpen && (
            <>
              <button type="button" tabIndex={-1} aria-label={t("closeEmojiMenu")} className="fixed inset-0 z-(--layer-popover-backdrop) cursor-default" onClick={() => { setEmojiOpen(false); emojiButtonRef.current?.focus(); }} />
              <div role="group" aria-label={t("chooseEmoji")} className="absolute top-full right-0 z-(--layer-popover) mt-1 grid w-52 grid-cols-4 gap-1 rounded-[10px] border border-(--border-app) bg-background p-2 shadow-xl sm:right-auto sm:left-0 sm:w-40">
                {EMOJI_OPTIONS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => handleEmoji(em)}
                    className="flex size-11 items-center justify-center rounded-lg text-base hover:bg-black/5 dark:hover:bg-white/10 sm:size-8"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
      </div>

      {mode === "plain" ? (
        <textarea
          ref={plainRef}
          aria-label={t("messageBody")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-35 flex-1 resize-none px-4 py-3 text-base leading-relaxed outline-none placeholder:text-(--text-muted) md:text-sm"
        />
      ) : (
        <div
          ref={richRef}
          contentEditable
          role="textbox"
          aria-label={t("messageBody")}
          aria-multiline="true"
          suppressContentEditableWarning
          onInput={() => onChange(richRef.current?.innerText ?? "")}
          data-placeholder={placeholder}
          className="compose-rich-editor min-h-35 flex-1 overflow-y-auto px-4 py-3 text-base leading-relaxed outline-none empty:before:text-(--text-muted) empty:before:content-[attr(data-placeholder)] md:text-sm"
        />
      )}
    </div>
  );
}
