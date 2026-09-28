import "server-only";

import { MailServiceError } from "./mail";
import { serviceStatus, tastemailRequest } from "./server";

export type LiveContact = {
  id: string;
  displayName: string | null;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = { displayName: string | null; email: string };

export type LiveAddressSuggestion = {
  name: string | null;
  email: string;
  interactionCount: number;
  lastUsedAt: string;
  saved: boolean;
};

export class ContactServiceError extends Error {
  constructor(readonly status: "invalid_request" | "conflict" | "not_found" | MailServiceError["status"]) {
    super(status);
  }
}

function contactStatus(status: number): ContactServiceError["status"] {
  if (status === 400) return "invalid_request";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return serviceStatus(status);
}

function parseContact(value: unknown): LiveContact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MailServiceError("unavailable");
  const contact = value as Record<string, unknown>;
  if (typeof contact.id !== "string" || !contact.id ||
      (contact.displayName !== null && typeof contact.displayName !== "string") ||
      typeof contact.email !== "string" || !contact.email ||
      typeof contact.createdAt !== "string" || typeof contact.updatedAt !== "string") {
    throw new MailServiceError("unavailable");
  }
  return {
    id: contact.id,
    displayName: contact.displayName,
    email: contact.email,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

export async function loadLiveContacts(token: string): Promise<LiveContact[]> {
  const response = await tastemailRequest("/api/contacts", token);
  if (!response.ok) throw new MailServiceError(serviceStatus(response.status));
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("contacts" in payload) ||
      !Array.isArray(payload.contacts) || payload.contacts.length > 500) {
    throw new MailServiceError("unavailable");
  }
  return payload.contacts.map(parseContact);
}

export async function loadLiveAddressSuggestions(token: string, query: string): Promise<LiveAddressSuggestion[]> {
  const params = new URLSearchParams({ q: query, limit: "8" });
  const response = await tastemailRequest(`/api/contacts/suggestions?${params}`, token);
  if (!response.ok) throw new MailServiceError(serviceStatus(response.status));
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("suggestions" in payload) ||
      !Array.isArray(payload.suggestions) || payload.suggestions.length > 8) {
    throw new MailServiceError("unavailable");
  }
  return payload.suggestions.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new MailServiceError("unavailable");
    const item = value as Record<string, unknown>;
    if ((item.name !== null && (typeof item.name !== "string" || [...item.name].length > 200 || /[\u0000-\u001f\u007f]/u.test(item.name))) ||
        typeof item.email !== "string" || !item.email || item.email.length > 320 || /[\u0000-\u001f\u007f]/u.test(item.email) ||
        typeof item.interactionCount !== "number" || !Number.isSafeInteger(item.interactionCount) || item.interactionCount < 0 ||
        typeof item.lastUsedAt !== "string" || item.lastUsedAt.length > 64 || !Number.isFinite(Date.parse(item.lastUsedAt)) ||
        typeof item.saved !== "boolean") throw new MailServiceError("unavailable");
    return item as LiveAddressSuggestion;
  });
}

export async function createLiveContact(token: string, input: ContactInput): Promise<LiveContact> {
  const response = await tastemailRequest("/api/contacts", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new ContactServiceError(contactStatus(response.status));
  return parseContact(await response.json());
}

export async function updateLiveContact(token: string, id: string, input: ContactInput): Promise<LiveContact> {
  const response = await tastemailRequest(`/api/contacts/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new ContactServiceError(contactStatus(response.status));
  return parseContact(await response.json());
}

export async function deleteLiveContact(token: string, id: string): Promise<void> {
  const response = await tastemailRequest(`/api/contacts/${encodeURIComponent(id)}`, token, { method: "DELETE" });
  if (!response.ok) throw new ContactServiceError(contactStatus(response.status));
  if (response.status !== 204) throw new MailServiceError("unavailable");
}
