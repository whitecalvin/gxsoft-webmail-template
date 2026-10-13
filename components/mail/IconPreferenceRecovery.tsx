"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { useServerMailboxIcons } from "@/context/mailbox-icon-context";
import { Button } from "@/components/ui/Button";

/** Read-only recovery; never automatically resubmit an uncertain preference mutation. */
export function IconPreferenceRecovery() {
  const { accountAddress } = useMail();
  const server = useServerMailboxIcons(accountAddress ?? "");
  const t = useTranslations("iconRecovery");
  const service = useTranslations("liveService");
  const router = useRouter();
  const pending = useRef(false);
  const [reading, setReading] = useState(false);
  const [transitioning, startTransition] = useTransition();
  if (!server.required || (server.matched && server.status === "ready")) return null;
  const status = server.matched ? server.status : "unavailable";
  const busy = reading || transitioning || status === "saving";
  const message = status === "conflict" ? t("conflict") : status === "uncertain" ? t("uncertain")
    : service(status === "saving" ? "loading" : status);
  return <div role="status" aria-live="polite" className="grid gap-2 text-sm text-(--text-muted)">
    <p>{message}</p>
    <Button size="sm" variant="ghost" disabled={busy} loading={busy} onClick={async () => {
      if (pending.current || busy) return;
      pending.current = true; setReading(true);
      try {
        // A missing SSR controller requires a fresh authenticated server render, not a local fallback.
        if (await server.refresh() === null) startTransition(() => router.refresh());
      } finally { pending.current = false; setReading(false); }
    }}>{t("reload")}</Button>
  </div>;
}
