export interface ImportedContact {
  name: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  mobile: string;
  memo: string;
}

const MAX_CONTACTS = 500;

export type ContactImportErrorCode =
  | "fileTooLarge"
  | "unclosedQuote"
  | "missingRows"
  | "missingNameColumn"
  | "tooManyContacts"
  | "missingCsvName"
  | "invalidVcard"
  | "missingVcardName"
  | "unsupportedFile";

export class ContactImportError extends Error {
  readonly code: ContactImportErrorCode;
  readonly row?: number;

  constructor(code: ContactImportErrorCode, row?: number) {
    super(code);
    this.name = "ContactImportError";
    this.code = code;
    this.row = row;
  }
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) throw new ContactImportError("unclosedQuote");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseCsv(input: string): ImportedContact[] {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new ContactImportError("missingRows");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const index = (...names: string[]) => headers.findIndex((value) => names.includes(value));
  const columns = {
    name: index("name", "full name", "이름", "성명"),
    email: index("email", "e-mail", "메일", "이메일"),
    company: index("company", "organization", "회사", "조직"),
    title: index("title", "job title", "직위", "직책"),
    phone: index("phone", "work phone", "전화", "회사 전화"),
    mobile: index("mobile", "cell", "휴대전화", "휴대폰"),
    memo: index("memo", "notes", "메모"),
  };
  if (columns.name < 0) throw new ContactImportError("missingNameColumn");
  if (rows.length - 1 > MAX_CONTACTS) throw new ContactImportError("tooManyContacts");

  return rows.slice(1).map((row, offset) => {
    const value = (column: number) => (column < 0 ? "" : (row[column] ?? "").trim());
    const name = value(columns.name);
    if (!name) throw new ContactImportError("missingCsvName", offset + 2);
    return {
      name,
      email: value(columns.email),
      company: value(columns.company),
      title: value(columns.title),
      phone: value(columns.phone),
      mobile: value(columns.mobile),
      memo: value(columns.memo),
    };
  });
}

function decodeVcard(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

function parseVcard(input: string): ImportedContact[] {
  const unfolded = input.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
  const blocks = [...unfolded.matchAll(/BEGIN:VCARD\s*\n([\s\S]*?)\nEND:VCARD/gi)];
  if (!blocks.length) throw new ContactImportError("invalidVcard");
  if (blocks.length > MAX_CONTACTS) throw new ContactImportError("tooManyContacts");

  return blocks.map((block, index) => {
    const contact: ImportedContact = { name: "", email: "", company: "", title: "", phone: "", mobile: "", memo: "" };
    let structuredName = "";
    for (const line of block[1].split("\n")) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const property = line.slice(0, colon).toUpperCase();
      const key = property.split(";")[0].split(".").pop();
      const raw = line.slice(colon + 1);
      const value = decodeVcard(raw);
      if (key === "FN") contact.name = value;
      else if (key === "N") structuredName = raw.split(";").slice(0, 2).reverse().map(decodeVcard).filter(Boolean).join(" ");
      else if (key === "EMAIL" && !contact.email) contact.email = value;
      else if (key === "ORG" && !contact.company) contact.company = decodeVcard(raw.split(";")[0]);
      else if (key === "TITLE") contact.title = value;
      else if (key === "TEL" && /CELL|MOBILE/i.test(property)) contact.mobile = value;
      else if (key === "TEL" && !contact.phone) contact.phone = value;
      else if (key === "NOTE") contact.memo = value;
    }
    contact.name ||= structuredName;
    if (!contact.name) throw new ContactImportError("missingVcardName", index + 1);
    return contact;
  });
}

export function parseContactImport(fileName: string, contents: string): ImportedContact[] {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".csv")) return parseCsv(contents);
  if (lowerName.endsWith(".vcf")) return parseVcard(contents);
  throw new ContactImportError("unsupportedFile");
}
