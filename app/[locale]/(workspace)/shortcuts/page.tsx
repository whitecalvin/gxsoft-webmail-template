"use client";

import { SettingsSectionPage } from "@/components/settings/SettingsSectionPage";


// Keyboard shortcut reference. Static/read-only — deliberately styled to
// look printable, per the "인쇄용 전체 목록 보기" link that leads here.
export default function ShortcutsPage() {
  return <SettingsSectionPage active="shortcuts" />;
}
