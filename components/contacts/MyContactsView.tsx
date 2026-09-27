"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Search, Star, Trash2 } from "lucide-react";
import { CONTACT_GROUPS, MY_CONTACTS } from "@/lib/mock-contacts";
import { ContactImportError, parseContactImport } from "@/lib/contact-import";
import { useToast } from "@/context/toast-context";
import type { Contact, ContactFilter, ContactGroup } from "@/types/contacts";

// Desktop "My Contacts" view: a filterable list on the left, an edit form
// for the selected contact on the right.
const GROUP_PILL_STYLE: Record<ContactGroup, string> = {
  external: "bg-[#ECEFFE] text-[#2B4BF2]",
  purchasing: "bg-[#FDF0E4] text-[#875A17]",
  advisor: "bg-[#EDEBF7] text-[#6B5CA8]",
  personal: "bg-[#F0F0EC] text-[#5C6068]",
};

const NEW_CONTACT_PALETTE = [
  { bg: "#E4EAFE", fg: "#2B4BF2" },
  { bg: "#E9F3EC", fg: "#267547" },
  { bg: "#EDEBF7", fg: "#6B5CA8" },
  { bg: "#FDF0E4", fg: "#875A17" },
];

export function MyContactsView({
  activeGroupFilter,
  onGroupFilterChange,
}: {
  activeGroupFilter: ContactFilter;
  onGroupFilterChange: (group: ContactFilter) => void;
}) {
  const toast = useToast();
  const t = useTranslations("contactsPage");
  const importT = useTranslations("contactImport");
  const [contacts, setContacts] = useState<Contact[]>(MY_CONTACTS);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null);
  const [draft, setDraft] = useState<Contact | null>(null);
  const [nameError, setNameError] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q);
      const matchesGroup =
        activeGroupFilter === "all" ||
        (activeGroupFilter === "starred" && c.starred) ||
        c.group === activeGroupFilter;
      return matchesQuery && matchesGroup;
    });
  }, [contacts, query, activeGroupFilter]);

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;
  const editing = draft?.id === selected?.id ? draft : selected;

  const updateSelected = (patch: Partial<Contact>) => {
    if (!editing) return;
    setDraft({ ...editing, ...patch });
    if (patch.name !== undefined) setNameError(false);
  };

  const saveSelected = () => {
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
    toast.success(t("saved"), { sub: name });
  };

  const toggleStar = (id: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, starred: !c.starred } : c))
    );
  };

  const deleteSelected = () => {
    if (!selected) return;
    setContacts((prev) => prev.filter((c) => c.id !== selected.id));
    setSelectedId(null);
    setDraft(null);
    setNameError(false);
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
    onGroupFilterChange("all");
    setQuery("");
    setSelectedId(newContact.id);
    setDraft(null);
    setNameError(false);
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
      onGroupFilterChange("all");
      setQuery("");
      setSelectedId(imported[0].id);
      setDraft(null);
      setNameError(false);
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

  return (
    <section aria-label={t("myContacts")} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col overflow-hidden border-r border-(--border-app)">
        <div className="flex shrink-0 flex-col gap-3 border-b border-(--border-app) px-4 py-4 2xl:flex-row 2xl:items-center 2xl:px-5">
          <div>
            <h2 className="text-base font-bold tracking-tight">{t("myContacts")}</h2>
            <p className="text-xs text-(--text-muted)">
              {t("contactSummary", { count: contacts.length, recent: 2 })}
            </p>
          </div>
          <div className="flex min-w-0 gap-2 2xl:ml-auto">
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
              className="min-h-10 min-w-0 flex-1 whitespace-nowrap rounded-[9px] border border-(--border-app) px-2 text-xs font-semibold outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:cursor-wait disabled:opacity-60 dark:hover:bg-white/10 2xl:flex-none 2xl:px-3"
              title={t("importTooltip")}
            >
              {importing ? t("importing") : t("import")}
            </button>
            <button
              type="button"
              onClick={addContact}
              className="min-h-10 min-w-0 flex-1 whitespace-nowrap rounded-[9px] px-2 text-xs font-semibold text-white transition hover:brightness-110 2xl:flex-none 2xl:px-3"
              style={{ backgroundColor: "var(--color-primary-solid)" }}
            >
              + {t("addContact")}
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--border-app) px-4 py-3 2xl:px-5">
          <div className="relative min-w-0 w-full 2xl:w-auto">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-(--text-muted)"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              className="h-10 w-full rounded-lg bg-black/4 pl-7 pr-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:bg-white/6 2xl:w-60"
            />
          </div>
          {CONTACT_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGroupFilterChange(g)}
              aria-pressed={activeGroupFilter === g}
              className={`min-h-10 rounded-full px-3 text-xs font-medium transition ${
                activeGroupFilter === g
                  ? "bg-(--text-app) text-(--surface-app)"
                  : "bg-black/5 text-(--text-muted) hover:bg-black/10 dark:bg-white/10"
              }`}
            >
              {t(`groups.${g}`)}{" "}
              {g === "all"
                ? contacts.length
                : g === "starred"
                  ? contacts.filter((c) => c.starred).length
                  : contacts.filter((c) => c.group === g).length}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-b border-(--border-app) px-4 py-2 text-[10.5px] font-bold uppercase tracking-[.04em] text-(--text-muted) xl:grid-cols-[minmax(0,1fr)_90px] 2xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_90px] 2xl:px-5">
            <span>{t("fields.name")}</span>
            <span className="hidden 2xl:block">{t("mail")}</span>
            <span className="hidden 2xl:block">{t("companyPosition")}</span>
            <span className="hidden text-right xl:block">{t("group")}</span>
          </div>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-sm text-(--text-muted)">
              {t("noMatchingContacts")}
            </p>
          )}
          {filtered.map((c) => {
            const isSelected = c.id === selected?.id;
            return (
              <div
                key={c.id}
                className={`relative isolate grid grid-cols-[minmax(0,1fr)] items-center gap-3 border-b border-(--border-app) px-4 py-2.5 text-left transition xl:grid-cols-[minmax(0,1fr)_90px] 2xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_90px] 2xl:px-5 ${
                  isSelected
                    ? "border-l-2 border-l-(--color-primary) bg-(--color-primary)/5"
                    : "hover:bg-black/2 dark:hover:bg-white/3"
                }`}
              >
                <button
                  type="button"
                  onClick={() => { setSelectedId(c.id); setDraft(null); setNameError(false); }}
                  aria-label={t("selectContact", { name: c.name, email: c.email })}
                  aria-pressed={isSelected}
                  className="absolute inset-0 z-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--focus-ring)"
                />
                <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ backgroundColor: c.bg, color: c.fg }}
                  >
                    {c.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{c.name}</span>
                    <span className="block truncate text-[11px] text-(--text-muted) 2xl:hidden">{c.email || c.company}</span>
                    <span className="block truncate text-[10px] text-(--text-muted) xl:hidden">{t(`groups.${c.group}`)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleStar(c.id)}
                    className="pointer-events-auto relative z-10 flex size-11 shrink-0 items-center justify-center rounded-(--radius-app) outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) dark:hover:bg-white/10"
                    aria-label={t(c.starred ? "removeFavorite" : "addFavorite", { name: c.name })}
                    aria-pressed={c.starred}
                  >
                    <Star
                      size={13}
                      fill={c.starred ? "#e0ac4a" : "none"}
                      color={c.starred ? "#e0ac4a" : "var(--text-muted)"}
                    />
                  </button>
                </div>
                <span className="pointer-events-none relative z-10 hidden truncate text-xs text-(--text-muted) 2xl:block">{c.email}</span>
                <span className="pointer-events-none relative z-10 hidden truncate text-xs text-(--text-muted) 2xl:block">{c.company}</span>
                <span className="pointer-events-none relative z-10 hidden justify-end xl:flex">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${GROUP_PILL_STYLE[c.group]}`}
                  >
                    {t(`groups.${c.group}`)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col overflow-y-auto bg-(--surface-muted) p-5">
        {!selected ? (
          <p className="m-auto text-sm text-(--text-muted)">
            {t("selectPrompt")}
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[13px] font-bold">{t("editContact")}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${GROUP_PILL_STYLE[selected.group]}`}
              >
                {t(`groups.${selected.group}`)}
              </span>
            </div>

            <div className="mb-4 flex items-center gap-3 rounded-[11px] border border-(--border-app) bg-background p-3.5">
              <span
                className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full text-lg font-bold"
                style={{ backgroundColor: selected.bg, color: selected.fg }}
              >
                {selected.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{editing?.name}</p>
                <p className="truncate text-xs text-(--text-muted)">{editing?.title}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {(
                [
                  "name", "company", "title", "email", "mobile", "phone", "memo",
                ] as const
              ).map((field) => (
                <label key={field} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-(--text-muted)">
                    {t(`fields.${field}`)}
                  </span>
                  <input
                    type="text"
                    value={editing?.[field] ?? ""}
                    onChange={(e) => updateSelected({ [field]: e.target.value })}
                    aria-invalid={field === "name" && nameError ? true : undefined}
                    aria-describedby={field === "name" && nameError ? "desktop-contact-name-error" : undefined}
                    className="h-9.5 rounded-[9px] border border-(--border-app) bg-background px-3 text-xs outline-none focus:border-(--color-primary) focus-visible:ring-2 focus-visible:ring-(--focus-ring) aria-invalid:border-(--status-danger)"
                  />
                  {field === "name" && nameError && (
                    <span id="desktop-contact-name-error" role="alert" className="text-xs text-(--status-danger)">{t("nameRequired")}</span>
                  )}
                </label>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={saveSelected}
                className="h-9 flex-1 rounded-[9px] text-sm font-semibold text-white transition hover:brightness-110"
                style={{ backgroundColor: "var(--color-primary-solid)" }}
              >
                {t("save")}
              </button>
              <button
                type="button"
                onClick={() => { setDraft(null); setNameError(false); }}
                className="h-9 rounded-[9px] border border-(--border-app) px-4 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t("cancelChanges")}
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                aria-label={t("delete")}
                className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#E8CBC8] text-(--status-danger) hover:bg-(--status-danger-bg)"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
