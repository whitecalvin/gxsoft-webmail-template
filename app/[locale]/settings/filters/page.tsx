"use client";

import { SettingsSectionPage } from "@/components/settings/SettingsSectionPage";
import { LiveMailRules } from "@/components/settings/LiveMailRules";
import { useMail } from "@/context/mail-context";

export default function Page() {
  const { mode } = useMail();
  return mode === "live" ? <LiveMailRules /> : <SettingsSectionPage active="filters" />;
}
