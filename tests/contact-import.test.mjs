import test from "node:test";
import assert from "node:assert/strict";
import { ContactImportError, parseContactImport } from "../lib/contact-import.ts";

test("CSV imports Korean headers, quoted commas and line breaks", () => {
  const contacts = parseContactImport(
    "people.csv",
    '\uFEFF이름,이메일,회사,메모\r\n"김, 민서",minseo@example.com,한빛,"첫 줄\n둘째 줄"\r\n',
  );
  assert.deepEqual(contacts, [{
    name: "김, 민서",
    email: "minseo@example.com",
    company: "한빛",
    title: "",
    phone: "",
    mobile: "",
    memo: "첫 줄\n둘째 줄",
  }]);
});

test("vCard imports folded lines and mobile numbers", () => {
  const contacts = parseContactImport(
    "people.vcf",
    "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Emma Rossi\r\nORG:Northwind\r\nTITLE:Partnerships\r\n Lead\r\nEMAIL:emma@example.com\r\nTEL;TYPE=CELL:+39 1234\r\nEND:VCARD\r\n",
  );
  assert.equal(contacts[0].name, "Emma Rossi");
  assert.equal(contacts[0].title, "PartnershipsLead");
  assert.equal(contacts[0].mobile, "+39 1234");
});

test("invalid imports reject without a partial result", () => {
  assert.throws(() => parseContactImport("people.txt", "name\nAda"), (error) => error instanceof ContactImportError && error.code === "unsupportedFile");
  assert.throws(() => parseContactImport("people.csv", "name,email\n,empty@example.com"), (error) => error instanceof ContactImportError && error.code === "missingCsvName" && error.row === 2);
  assert.throws(() => parseContactImport("people.csv", 'name,email\n"Ada,ada@example.com'), (error) => error instanceof ContactImportError && error.code === "unclosedQuote");
  assert.throws(() => parseContactImport("people.vcf", "BEGIN:VCARD\nEMAIL:empty@example.com\nEND:VCARD"), (error) => error instanceof ContactImportError && error.code === "missingVcardName" && error.row === 1);
});
