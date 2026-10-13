"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { readAdminLicenseFile } from "@/lib/admin-license-file";

export function AdminLicenseFilePicker({ disabled, onValue, onError, onBusyChange }: {
  disabled: boolean;
  onValue: (value: string) => void;
  onError: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations("imageAssets");
  const input = useRef<HTMLInputElement>(null), busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return <div>
    <input ref={input} type="file" hidden accept=".license,.txt,text/plain" disabled={disabled} aria-label={t("choose")} onChange={async event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || disabled || busy.current) return;
      busy.current = true;
      onBusyChange(true);
      // 새 파일이 잘못됐을 때 이전 내용을 실수로 저장하지 않도록 먼저 비운다.
      onValue("");
      try {
        const value = await readAdminLicenseFile(file);
        if (alive.current) onValue(value);
      } catch { if (alive.current) onError(); }
      finally { busy.current = false; onBusyChange(false); }
    }} />
    <Button disabled={disabled} onClick={() => input.current?.click()}>{t("choose")}</Button>
  </div>;
}
