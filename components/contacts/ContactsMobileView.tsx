"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Plus, Search, Star, Trash2, Upload } from "lucide-react";
import { MY_CONTACTS } from "@/lib/mock-contacts";
import { ContactImportError, parseContactImport } from "@/lib/contact-import";
import { useToast } from "@/context/toast-context";
import type { Contact, ContactFilter } from "@/types/contacts";

// Mobile contacts: a filterable list that drills into a full-screen edit
// form on tap, in place of the desktop's side-by-side list/detail layout.
const FILTERS: ContactFilter[] = ["all", "starred", "external"];

const NEW_CONTACT_PALETTE = [
  { bg: "#E4EAFE", fg: "#2B4BF2" },
  { bg: "#E9F3EC", fg: "#267547" },
  { bg: "#EDEBF7", fg: "#6B5CA8" },
  { bg: "#FDF0E4", fg: "#875A17" },
];

export function ContactsMobileView() {
  const toast = useToast();
  const t = useTranslations("contactsPage");
  const importT = useTranslations("contactImport");
  const [contacts, setContacts] = useState<Contact[]>(MY_CONTACTS);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ContactFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Contact | null>(null);
  const [nameError, setNameError] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const contactButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (openId) {
      backButtonRef.current?.focus();
      return;
    }
    const returnId = returnFocusIdRef.current;
    if (!returnId) return;
    (contactButtonRefs.current.get(returnId) ?? addButtonRef.current)?.focus();
    returnFocusIdRef.current = null;
  }, [openId]);

  const openContact = (id: string) => {
    returnFocusIdRef.current = id;
    setDraft(null);
    setNameError(false);
    setOpenId(id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "starred" && c.starred) ||
        (filter === "external" && c.group === "external");
      return matchesQuery && matchesFilter;
    });
  }, [contacts, query, filter]);

  const open = contacts.find((c) => c.id === openId) ?? null;
  const editing = draft?.id === open?.id ? draft : open;

  const toggleStar = (id: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, starred: !c.starred } : c))
    );
  };

  const updateOpen = (patch: Partial<Contact>) => {
    if (!editing) return;
    setDraft({ ...editing, ...patch });
    if (patch.name !== undefined) setNameError(false);
  };

  const saveOpen = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      setNameError(true);
      return;
    }
    const saved = { ...editing, name, initials: name.slice(0, 1) };
    setContacts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    setDraft(null);
    setNameError(false);
    setOpenId(null);
    toast.success(t("saved"), { sub: name });
  };

  const deleteOpen = () => {
    if (!open) return;
    setContacts((prev) => prev.filter((c) => c.id !== open.id));
    setDraft(null);
    setNameError(false);
    setOpenId(null);
  };

  const addContact = () => {
    const palette = NEW_CONTACT_PALETTE[contacts.length % NEW_CONTACT_PALETTE.length];
    const newContact: Contact = {
      id: `contact-${Date.now()}`,
      name: t("newContact"),
      email: "",
      company: "",
      title: "",
      phone: "",
      mobile: "",
      memo: "",
      group: "personal",
      initials: t("newContact").slice(0, 1),
      bg: palette.bg,
      fg: palette.fg,
      starred: false,
    };
    setContacts((prev) => [newContact, ...prev]);
    setQuery("");
    setFilter("all");
    openContact(newContact.id);
    toast.success(t("contactAdded"), { sub: t("enterDetails") });
  };

  const importContacts = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new ContactImportError("fileTooLarge");
      const parsed = parseContactImport(file.name, await file.text());
      const knownEmails = new Set(contacts.map((contact) => contact.email.trim().toLowerCase()).filter(Boolean));
      const unique = parsed.filter((contact) => {
        const email = contact.email.trim().toLowerCase();
        if (!email) return true;
        if (knownEmails.has(email)) return false;
        knownEmails.add(email);
        return true;
      });
      if (!unique.length) {
        toast.info(importT("noNewContacts"), { sub: importT("duplicateNotice") });
        return;
      }
      const batchId = Date.now().toString(36);
      const imported: Contact[] = unique.map((contact, index) => ({
        ...contact,
        id: `contact-${globalThis.crypto?.randomUUID?.() ?? `${batchId}-${index}`}`,
        group: "personal",
        initials: contact.name.slice(0, 1),
        starred: false,
        ...NEW_CONTACT_PALETTE[(contacts.length + index) % NEW_CONTACT_PALETTE.length],
      }));
      setContacts((prev) => [...imported, ...prev]);
      setQuery("");
      setFilter("all");
      toast.success(importT("imported", { count: imported.length }), {
        sub: parsed.length === unique.length ? file.name : importT("duplicatesSkipped", { count: parsed.length - unique.length }),
      });
    } catch (error) {
      toast.error(importT("failed"), {
        sub: error instanceof ContactImportError
          ? importT(`errors.${error.code}`, { row: error.row ?? 0 })
          : importT("errors.unknown"),
      });
    } finally {
      input.value = "";
      setImporting(false);
    }
  };

  if (open) {
    return (
    <section aria-label={t("mobileContacts")} className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-(--border-app) px-4 py-3">
          <button
            ref={backButtonRef}
            type="button"
            onClick={() => { setDraft(null); setNameError(false); setOpenId(null); }}
            className="flex size-11 items-center justify-center rounded-full outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:hover:bg-white/10"
            aria-label={t("backToList")}
          >
            <ArrowLeft size={18} />
          </button>
          <p className="text-[15px] font-bold">{t("editContact")}</p>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-(--border-app) p-3.5">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold"
              style={{ backgroundColor: editing?.bg, color: editing?.fg }}
            >
              {editing?.name.trim().slice(0, 1) || editing?.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{editing?.name}</p>
              <p className="truncate text-xs text-(--text-muted)">{editing?.title}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {(
              [
                "name", "company", "title", "email", "mobile", "phone",
              ] as const
            ).map((field) => (
              <label key={field} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-(--text-muted)">
                  {t(`fields.${field}`)}
                </span>
                <input
                  type="text"
                  value={editing?.[field] ?? ""}
                  onChange={(e) => updateOpen({ [field]: e.target.value })}
                  aria-invalid={field === "name" && nameError ? true : undefined}
                  aria-describedby={field === "name" && nameError ? "mobile-contact-name-error" : undefined}
                  className="h-11 rounded-[9px] border border-(--border-app) bg-background px-3 text-base outline-none focus:border-(--color-primary) focus-visible:ring-2 focus-visible:ring-(--focus-ring) aria-invalid:border-(--status-danger)"
                />
                {field === "name" && nameError && (
                  <span id="mobile-contact-name-error" role="alert" className="text-xs text-(--status-danger)">{t("nameRequired")}</span>
                )}
              </label>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={saveOpen}
              className="h-11 flex-1 rounded-[9px] text-sm font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: "var(--color-primary-solid)" }}
            >
              {t("save")}
            </button>
            <button
              type="button"
              onClick={deleteOpen}
              aria-label={t("delete")}
              className="flex h-11 w-11 items-center justify-center rounded-[9px] border border-[#E8CBC8] text-(--status-danger)"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t("mobileContacts")} className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-(--border-app) px-5 pb-3 pt-2">
        <div>
          <p className="text-sm font-semibold text-(--text-muted)">{t("myCount", { count: contacts.length })}</p>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,.vcf,text/csv,text/vcard"
          onChange={importContacts}
          className="hidden"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          disabled={importing}
          className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-[9px] border border-(--border-app) outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:cursor-wait disabled:opacity-60 dark:hover:bg-white/10"
          title={t("importTooltip")}
          aria-label={importing ? t("importingContacts") : t("importContacts")}
        >
          <Upload size={18} />
        </button>
        <button
          ref={addButtonRef}
          type="button"
          onClick={addContact}
          className="flex size-11 shrink-0 items-center justify-center rounded-[9px] text-white outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
          style={{ backgroundColor: "var(--color-primary-solid)" }}
          aria-label={t("addContact")}
        >
          <Plus size={18} />
        </button>
      </header>

      <div className="shrink-0 border-b border-(--border-app) px-4 py-3">
        <div className="relative mb-2.5">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="h-11 w-full rounded-[10px] bg-black/4 pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:bg-white/6"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`min-h-11 rounded-full px-3 text-xs font-semibold transition ${
                filter === f
                  ? "bg-(--text-app) text-(--surface-app)"
                  : "bg-black/5 text-(--text-muted) dark:bg-white/10"
              }`}
            >
              {t(`groups.${f}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-(--text-muted)">
            {t("noMatchingContacts")}
          </p>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 border-b border-(--border-app) px-4 py-2"
          >
            <button
              ref={(node) => {
                if (node) contactButtonRefs.current.set(c.id, node);
                else contactButtonRefs.current.delete(c.id);
              }}
              type="button"
              onClick={() => openContact(c.id)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-(--radius-app) text-left outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
              aria-label={t("viewContact", { name: c.name })}
            >
              <span
                className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px] text-xs font-bold"
                style={{ backgroundColor: c.bg, color: c.fg }}
              >
                {c.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block truncate text-xs text-(--text-muted)">
                  {c.title} · {c.company}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => toggleStar(c.id)}
              className="flex size-11 shrink-0 items-center justify-center rounded-(--radius-app) outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:hover:bg-white/10"
              aria-label={t(c.starred ? "removeFavorite" : "addFavorite", { name: c.name })}
              aria-pressed={c.starred}
            >
              <Star
                size={16}
                fill={c.starred ? "#e0ac4a" : "none"}
                color={c.starred ? "#e0ac4a" : "var(--text-muted)"}
              />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
