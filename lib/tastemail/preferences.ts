import "server-only";

import { serviceStatus, tastemailRequest } from "./server";

type ServiceStatus = ReturnType<typeof serviceStatus>;
type JsonObject = Record<string, unknown>;

export class PreferencesServiceError extends Error {
  constructor(readonly status: ServiceStatus | "invalid_request" | "conflict") { super(status); }
}

export type LiveMailIdentityPreference = {
  id: string;
  address: string;
  displayName: string | null;
  isDefault: boolean;
  mailSignature: string;
  mailSignatureHtml: string;
  mailSignatureFormat: "text/plain" | "text/html";
};

export type LiveMailPreferences = { identities: LiveMailIdentityPreference[] };

export type LiveSignatureUpdate = {
  identityId: string;
  mailSignature: string;
  mailSignatureHtml: string;
  mailSignatureFormat: "text/plain" | "text/html";
};

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function projectPreferences(payload: unknown): LiveMailPreferences {
  const root = object(payload);
  if (!Array.isArray(root?.identities) || root.identities.length > 100) throw new PreferencesServiceError("unavailable");
  const identities = root.identities.map(object);
  if (identities.some((item) => !item || typeof item.id !== "string" || typeof item.address !== "string" ||
    (item.displayName !== null && typeof item.displayName !== "string") || typeof item.isDefault !== "boolean" ||
    typeof item.mailSignature !== "string" || typeof item.mailSignatureHtml !== "string" ||
    (item.mailSignatureFormat !== "text/plain" && item.mailSignatureFormat !== "text/html"))) {
    throw new PreferencesServiceError("unavailable");
  }
  return { identities: identities.map((item) => ({
    id: item!.id as string,
    address: item!.address as string,
    displayName: item!.displayName as string | null,
    isDefault: item!.isDefault as boolean,
    mailSignature: item!.mailSignature as string,
    mailSignatureHtml: item!.mailSignatureHtml as string,
    mailSignatureFormat: item!.mailSignatureFormat as "text/plain" | "text/html",
  })) };
}

async function preferencesResponse(response: Response): Promise<LiveMailPreferences> {
  if (!response.ok) {
    if (response.status === 400) throw new PreferencesServiceError("invalid_request");
    if (response.status === 409) throw new PreferencesServiceError("conflict");
    throw new PreferencesServiceError(serviceStatus(response.status));
  }
  try { return projectPreferences(await response.json()); }
  catch (error) {
    if (error instanceof PreferencesServiceError) throw error;
    throw new PreferencesServiceError("unavailable");
  }
}

export async function loadLiveMailPreferences(token: string): Promise<LiveMailPreferences> {
  return preferencesResponse(await tastemailRequest("/api/user/preferences", token));
}

export async function updateLiveMailSignature(token: string, update: LiveSignatureUpdate): Promise<LiveMailPreferences> {
  const result = await preferencesResponse(await tastemailRequest("/api/user/preferences", token, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  }));
  if (!result.identities.some((identity) => identity.id === update.identityId)) {
    throw new PreferencesServiceError("unavailable");
  }
  return result;
}
