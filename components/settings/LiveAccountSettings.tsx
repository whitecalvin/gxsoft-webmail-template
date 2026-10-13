"use client";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SettingsPageIntro, SettingsPanel } from "./SettingsPrimitives";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";
import { LinkedAccountSettings } from "./LinkedAccountSettings";
import { ImageAssetSettings } from "./ImageAssetSettings";

type Identity = { id: string; address: string; displayName: string | null; isDefault: boolean };
type Status = "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type LoadState = { attempt: number; status: Status; identities: Identity[] };

function identitiesFrom(value: unknown): Identity[] {
  if (!value || typeof value !== "object" || !("identities" in value) || !Array.isArray(value.identities) ||
    value.identities.length > 100 || value.identities.some((item: unknown) => !item || typeof item !== "object" ||
      !("id" in item) || typeof item.id !== "string" || !("address" in item) || typeof item.address !== "string" ||
      !("displayName" in item) || (item.displayName !== null && typeof item.displayName !== "string") ||
      !("isDefault" in item) || typeof item.isDefault !== "boolean")) throw new Error("unavailable");
  return value.identities as Identity[];
}

export function LiveAccountSettings() {
  const t = useTranslations("settingsSystem");
  const live = useTranslations("accountLive");
  const service = useTranslations("liveService");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState | null>(null);
  const current = state?.attempt === attempt ? state : null;

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]);
    fetch("/api/mail/preferences", { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        return identitiesFrom(payload);
      })
      .then((identities) => { if (!controller.signal.aborted) setState({ attempt, status: "ready", identities }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const status: Status = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as Status : "retryable";
        setState({ attempt, status, identities: [] });
      });
    return () => controller.abort();
  }, [attempt]);

  return <>
    <SettingsPageIntro title={t("nav.account")} description={live("description")} />
    <LinkedAccountSettings />
    <ImageAssetSettings scope="avatar" />
    <p role="note" className="rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) px-4 py-3 text-sm text-(--text-muted)">{live("readOnly")}</p>
    {!current ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p>
      : current.status !== "ready" ? <SystemErrorNotice message={service(current.status)} actionLabel={service("retry")} onAction={() => setAttempt((value) => value + 1)} />
        : current.identities.length === 0 ? <p role="status" className="text-sm text-(--text-muted)">{live("noIdentities")}</p>
          : <SettingsPanel title={t("sections.accountIdentity")}>
            <ul className="divide-y divide-(--border-app)">
              {current.identities.map((identity) => <li key={identity.id} className="flex min-w-0 flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  {identity.displayName ? <p className="truncate text-sm font-medium">{identity.displayName}</p> : null}
                  <p className="break-all text-sm text-(--text-muted)">{identity.address}</p>
                </div>
                {identity.isDefault ? <span className="shrink-0 rounded-full bg-(--color-primary)/10 px-2 py-1 text-xs text-(--color-primary-ink)">{live("defaultIdentity")}</span> : null}
              </li>)}
            </ul>
          </SettingsPanel>}
  </>;
}
