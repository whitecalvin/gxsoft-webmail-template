"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useTranslations } from "next-intl";
import { AlignCenter, AlignLeft, AlignRight, Bold, Image as ImageIcon, Italic, Link2, List, ListOrdered, Redo2, RemoveFormatting, Smile, Strikethrough, Type, Underline, Undo2, Unlink } from "lucide-react";
import { composeLinkUrl } from "@/lib/compose-link";
import { useToast } from "@/context/toast-context";
import { imageDataUrl, MAX_INLINE_IMAGE_BYTES, MAX_INLINE_IMAGES, RASTER_IMAGE } from "@/lib/inline-image";

const EMOJI_OPTIONS = ["👍", "🙏", "✅", "🎉", "😊", "🚀", "📎", "❗"];

// Compose body editor with two modes sharing one toolbar:
//  - "plain": a <textarea>; formatting buttons insert Markdown-style
//    characters (**bold**, _italic_) around the selection.
//  - "rich": a contentEditable <div> driven by the deprecated but still
//    universally-supported `document.execCommand` API for real bold/italic/
//    list/image formatting.
// `value`/`onChange` carry the plain-text fallback. Live composition can also
// receive the rich markup separately for the server's HTML body part.
export type ComposeEditorMode = "plain" | "rich";

interface ComposeEditorProps {
  value: string;
  onChange: (plainText: string) => void;
  onHtmlChange?: (html: string | null) => void;
  onModeChange?: () => void;
  initialHtml?: string | null;
  inlineAttachments?: Array<{ blobId?: string; type?: string; size: number; cid?: string | null; disposition?: "attachment" | "inline" }>;
  inlineAccountId?: string;
  placeholder?: string;
  onImageAttach?: (file: File) => void;
  onInlineImageUpload?: (file: File) => Promise<string | null>;
  allowInlineImages?: boolean;
  imageAttachDisabled?: boolean;
  initialMode?: ComposeEditorMode;
  disabled?: boolean;
  label?: string;
  emitInitialHtml?: boolean;
}

function serializedRichHtml(root: HTMLDivElement | null): string {
  if (!root) return "";
  // Authenticated image previews are UI-only; the server must receive the original CID references.
  const copy = root.cloneNode(true) as HTMLDivElement;
  for (const image of copy.querySelectorAll<HTMLImageElement>("img[data-cid]")) {
    const cid = image.dataset.cid;
    if (cid) image.setAttribute("src", `cid:${cid}`);
    image.removeAttribute("data-cid");
  }
  return copy.innerHTML;
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

const EDITABLE_TAGS = new Set(["a", "b", "blockquote", "br", "code", "del", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "li", "ol", "p", "pre", "s", "span", "strike", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul"]);
const DROP_TAGS = new Set(["audio", "button", "embed", "form", "iframe", "input", "link", "math", "meta", "object", "picture", "script", "source", "style", "svg", "video"]);

function editableDraftHtml(html: string, allowCidImages = true): string {
  const source = document.createElement("template");
  source.innerHTML = html;
  const output = document.createElement("div");
  const append = (parent: Node, node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ""));
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) return;
    if (tag === "img") {
      const src = node.getAttribute("src");
      if (allowCidImages && src && /^cid:[^\s<>"']+$/iu.test(src)) {
        const image = document.createElement("img");
        image.setAttribute("src", src);
        image.setAttribute("alt", node.getAttribute("alt") ?? "");
        parent.appendChild(image);
      }
      return;
    }
    let element = EDITABLE_TAGS.has(tag) ? document.createElement(tag) : null;
    // 임시보관 메일의 정렬만 유지하고 임의의 CSS는 복원하지 않는다.
    if (element && node instanceof HTMLElement && ["left", "center", "right", "justify"].includes(node.style.textAlign)) {
      element.style.textAlign = node.style.textAlign;
    }
    if (element?.tagName === "A") {
      const href = node.getAttribute("href");
      const safeHref = href ? composeLinkUrl(href) : null;
      if (safeHref) element.setAttribute("href", safeHref);
      else element = null;
    }
    const target = element ?? parent;
    for (const child of node.childNodes) append(target, child);
    if (element) parent.appendChild(element);
  };
  for (const child of source.content.childNodes) append(output, child);
  return output.innerHTML;
}

export function ComposeEditor({ value, onChange, onHtmlChange, onModeChange, initialHtml, inlineAttachments, inlineAccountId, placeholder, onImageAttach, onInlineImageUpload, allowInlineImages = true, imageAttachDisabled = false, initialMode = "plain", disabled = false, label, emitInitialHtml = true }: ComposeEditorProps) {
  const t = useTranslations("composeEditor");
  const linkId = useId();
  const toast = useToast();
  const [mode, setMode] = useState<ComposeEditorMode>(initialHtml ? "rich" : initialMode);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const savedRange = useRef<Range | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const plainRef = useRef<HTMLTextAreaElement>(null);
  const richRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const restoredInitialHtml = useRef(false);

  useEffect(() => {
    if (mode !== "rich") return;
    const rememberSelection = () => {
      const selection = window.getSelection();
      const editor = richRef.current;
      if (!editor || !selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return;
      savedRange.current = range.cloneRange();
      setActiveFormats(["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight"]
        .filter((command) => document.queryCommandState(command)));
    };
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, [mode]);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  useEffect(() => {
    if (initialHtml && mode === "plain" && !restoredInitialHtml.current) setMode("rich");
  }, [initialHtml, mode]);

  const switchMode = (next: ComposeEditorMode) => {
    if (next === mode) return;
    onModeChange?.();
    savedRange.current = null;
    setLinkOpen(false);
    setActiveFormats([]);
    // Switching to plain text is lossy — rich formatting has no plain-text
    // equivalent, so warn before discarding it.
    if (next === "plain" && mode === "rich") {
      toast.info(t("switchingToPlain"), { sub: t("formattingWillBeLost") });
      onHtmlChange?.(null);
    }
    setMode(next);
    requestAnimationFrame(() => {
      if (next === "rich" && richRef.current) {
        richRef.current.innerHTML = plainToHtml(value);
        onHtmlChange?.(serializedRichHtml(richRef.current));
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
    if (disabled) return;
    const editor = richRef.current;
    if (!editor) return;
    editor.focus();
    // 툴바·링크 입력창으로 포커스가 이동해도 본문 안의 선택만 복원한다.
    const range = savedRange.current;
    if (range && editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    document.execCommand(command, false, arg);
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
    setActiveFormats(["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight"]
      .filter((format) => document.queryCommandState(format)));
    if (richRef.current) {
      onChange(richRef.current.innerText);
      onHtmlChange?.(serializedRichHtml(richRef.current));
    }
  };

  const handleBold = () => (mode === "rich" ? richExec("bold") : wrapSelection("**", "**"));
  const handleItalic = () => (mode === "rich" ? richExec("italic") : wrapSelection("_", "_"));
  const handleList = () => (mode === "rich" ? richExec("insertUnorderedList") : prefixLines("- "));
  const handleLink = () => {
    setLinkUrl("");
    setLinkError(false);
    setLinkOpen((open) => !open);
  };
  const applyLink = () => {
    const url = composeLinkUrl(linkUrl);
    if (!url) { setLinkError(true); return; }
    if (mode === "rich") {
      const range = savedRange.current;
      if (range && !range.collapsed) richExec("createLink", url);
      else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.textContent = url;
        richExec("insertHTML", anchor.outerHTML);
      }
    } else insertAtCursor(url);
    setLinkOpen(false);
  };
  const handleEmoji = (em: string) => {
    setEmojiOpen(false);
    if (mode === "rich") richExec("insertText", em);
    else insertAtCursor(em);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    if (html) {
      // 복사된 CID/외부 이미지에는 이 작성 세션의 업로드 증거가 없다.
      // 기본 서식만 허용하고 이미지 삽입은 기존 업로드 버튼을 사용한다.
      const safeHtml = editableDraftHtml(html, false);
      if (safeHtml) { richExec("insertHTML", safeHtml); return; }
    }
    richExec("insertText", event.clipboardData.getData("text/plain"));
  };

  const handleImageFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (mode === "rich" && onInlineImageUpload) {
      const editor = richRef.current;
      if (!editor?.isConnected) return;
      const cid = await onInlineImageUpload(file);
      if (!cid || richRef.current !== editor || !editor.isConnected) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (richRef.current !== editor || !editor.isConnected || typeof reader.result !== "string") return;
        const image = document.createElement("img");
        image.src = reader.result;
        image.dataset.cid = cid;
        image.alt = file.name;
        image.style.maxWidth = "100%";
        richExec("insertHTML", image.outerHTML);
      };
      reader.readAsDataURL(file);
      return;
    }
    if (mode === "rich" && allowInlineImages) {
      const editor = richRef.current;
      if (!editor?.isConnected) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (richRef.current !== editor || !editor.isConnected) return;
        richExec("insertImage", String(reader.result));
      };
      reader.readAsDataURL(file);
    } else {
      onImageAttach?.(file);
      toast.info(t("imageAddedAsAttachment"), { sub: file.name });
    }
  };

  useEffect(() => {
    if (mode !== "rich" || !richRef.current) return;
    if (initialHtml && !restoredInitialHtml.current) {
      richRef.current.innerHTML = editableDraftHtml(initialHtml);
      restoredInitialHtml.current = true;
      if (emitInitialHtml) onHtmlChange?.(serializedRichHtml(richRef.current));
      return;
    }
    if (restoredInitialHtml.current) return;
    if (richRef.current.innerText !== value && document.activeElement !== richRef.current) {
      richRef.current.innerHTML = plainToHtml(value);
      if (emitInitialHtml) onHtmlChange?.(serializedRichHtml(richRef.current));
    }
  }, [mode, value, initialHtml, onHtmlChange, emitInitialHtml]);

  useEffect(() => {
    if (mode !== "rich" || !initialHtml || !inlineAttachments?.length || !richRef.current) return;
    const controller = new AbortController();
    const images = [...richRef.current.querySelectorAll<HTMLImageElement>("img")]
      .filter((image) => image.getAttribute("src")?.toLowerCase().startsWith("cid:"))
      .slice(0, MAX_INLINE_IMAGES);
    for (const image of images) {
      const originalSource = image.getAttribute("src");
      if (!originalSource) continue;
      const cid = originalSource.slice(4);
      const attachment = inlineAttachments.find((item) => item.disposition === "inline" && item.cid?.toLowerCase() === cid.toLowerCase() &&
        typeof item.blobId === "string" && typeof item.type === "string" && RASTER_IMAGE.test(item.type) && item.size <= MAX_INLINE_IMAGE_BYTES);
      if (!attachment?.blobId || !attachment.type) continue;
      void imageDataUrl({ blobId: attachment.blobId, type: attachment.type, size: attachment.size }, inlineAccountId, controller.signal)
        .then((source) => {
          if (controller.signal.aborted || !image.isConnected || image.getAttribute("src") !== originalSource) return;
          image.dataset.cid = cid;
          image.setAttribute("src", source);
        })
        .catch(() => { /* Keep the original CID when the authenticated preview is unavailable. */ });
    }
    return () => controller.abort();
  }, [mode, initialHtml, inlineAttachments, inlineAccountId]);

  const toolbarBtn = "flex size-11 shrink-0 items-center justify-center rounded-lg text-(--text-muted) outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:bg-black/10 aria-pressed:text-(--color-primary) dark:hover:bg-white/10 dark:aria-pressed:bg-white/15 sm:size-8";
  const richTools = [
    { key: "underline", command: "underline", Icon: Underline },
    { key: "strikethrough", command: "strikeThrough", Icon: Strikethrough },
    { key: "numberedList", command: "insertOrderedList", Icon: ListOrdered },
    { key: "alignLeft", command: "justifyLeft", Icon: AlignLeft },
    { key: "alignCenter", command: "justifyCenter", Icon: AlignCenter },
    { key: "alignRight", command: "justifyRight", Icon: AlignRight },
    { key: "undo", command: "undo", Icon: Undo2 },
    { key: "redo", command: "redo", Icon: Redo2 },
    { key: "clearFormatting", command: "removeFormat", Icon: RemoveFormatting },
    { key: "removeLink", command: "unlink", Icon: Unlink },
  ];

  return (
    <fieldset disabled={disabled} className="m-0 flex min-h-0 min-w-0 flex-1 flex-col border-0 p-0">
      <div role="group" aria-label={t("formattingToolbar")} onMouseDown={(event) => {
        if (mode === "rich" && (event.target as Element).closest("button")) event.preventDefault();
      }} className="flex shrink-0 flex-wrap items-center gap-0.5 border-y border-(--border-app) bg-(--surface-muted) px-3 py-1.5">
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
        <button type="button" onClick={handleBold} className={toolbarBtn} aria-pressed={mode === "rich" ? activeFormats.includes("bold") : undefined} aria-label={t("bold")} title={t("bold")}>
          <Bold size={14} />
        </button>
        <button type="button" onClick={handleItalic} className={toolbarBtn} aria-pressed={mode === "rich" ? activeFormats.includes("italic") : undefined} aria-label={t("italic")} title={t("italic")}>
          <Italic size={14} />
        </button>
        <button type="button" onClick={handleList} className={toolbarBtn} aria-pressed={mode === "rich" ? activeFormats.includes("insertUnorderedList") : undefined} aria-label={t("list")} title={t("list")}>
          <List size={14} />
        </button>
        {richTools.map(({ key, command, Icon }) => (
          <button key={key} type="button" disabled={mode !== "rich"} onClick={() => richExec(command)} className={toolbarBtn}
            aria-label={t(key)} title={t(key)} aria-pressed={mode === "rich" && !["undo", "redo", "removeFormat", "unlink"].includes(command) ? activeFormats.includes(command) : undefined}>
            <Icon size={14} />
          </button>
        ))}
        <button type="button" onClick={handleLink} className={toolbarBtn} aria-label={t("insertLink")} title={t("insertLink")}>
          <Link2 size={14} />
        </button>
          <button
            type="button"
            disabled={imageAttachDisabled}
            onClick={() => imageInputRef.current?.click()}
            className={`${toolbarBtn} disabled:cursor-not-allowed disabled:opacity-50`}
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
        <input ref={imageInputRef} type="file" accept="image/*" disabled={imageAttachDisabled} className="hidden" onChange={handleImageFile} />
      </div>

      {linkOpen && (
        <div className="shrink-0 border-b border-(--border-app) bg-background px-4 py-3" onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setLinkOpen(false); (mode === "rich" ? richRef.current : plainRef.current)?.focus(); }
        }}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor={linkId}>{t("linkUrl")}</label>
            <input id={linkId} ref={linkInputRef} type="url" value={linkUrl} onChange={(event) => { setLinkUrl(event.target.value); setLinkError(false); }}
              aria-invalid={linkError} aria-describedby={linkError ? `${linkId}-error` : undefined} placeholder="https://example.com"
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } }}
              className="h-10 min-w-0 flex-1 rounded-lg border border-(--border-app) bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) md:text-sm" />
            <button type="button" onClick={applyLink} className="h-10 rounded-lg bg-(--color-primary) px-3 font-semibold text-white">{t("applyLink")}</button>
            <button type="button" onClick={() => { setLinkOpen(false); (mode === "rich" ? richRef.current : plainRef.current)?.focus(); }} className="h-10 rounded-lg px-3 hover:bg-black/5 dark:hover:bg-white/10">{t("cancelLink")}</button>
          </div>
          {linkError && <p id={`${linkId}-error`} role="alert" className="mt-2 text-xs text-red-600">{t("invalidLink")}</p>}
        </div>
      )}

      {mode === "plain" ? (
        <textarea
          ref={plainRef}
          aria-label={label ?? t("messageBody")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-35 flex-1 resize-none px-4 py-3 text-base leading-relaxed outline-none placeholder:text-(--text-muted) md:text-sm"
        />
      ) : (
        <div
          ref={richRef}
          contentEditable={!disabled}
          role="textbox"
          aria-label={label ?? t("messageBody")}
          aria-disabled={disabled}
          aria-multiline="true"
          suppressContentEditableWarning
          onInput={() => {
            if (disabled) return;
            onChange(richRef.current?.innerText ?? "");
            onHtmlChange?.(serializedRichHtml(richRef.current));
          }}
          onPaste={handlePaste}
          data-placeholder={placeholder}
          className="compose-rich-editor min-h-35 flex-1 overflow-y-auto px-4 py-3 text-base leading-relaxed outline-none empty:before:text-(--text-muted) empty:before:content-[attr(data-placeholder)] [&_a]:text-(--color-primary) [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 md:text-sm"
        />
      )}
    </fieldset>
  );
}
