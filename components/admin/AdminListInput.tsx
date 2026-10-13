"use client";

import { useState, type TextareaHTMLAttributes } from "react";
import { adminListInputValues } from "@/lib/admin-list-input";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "defaultValue" | "onChange"> & {
  value: string[];
  onChange: (value: string[]) => void;
  addresses?: boolean;
};

export function AdminListInput({ value, onChange, addresses = false, ...props }: Props) {
  const [draft, setDraft] = useState<{ text: string; value: string[] } | null>(null);
  // 입력 중의 빈 줄·공백은 보존하고 부모에는 서버 계약용 배열만 전달합니다.
  // 새 서버 값/초안은 배열 identity가 달라지므로 이전 raw 입력을 재사용하지 않습니다.
  return <textarea {...props} value={draft?.value === value ? draft.text : value.join("\n")} onChange={event => {
    const text = event.target.value, next = adminListInputValues(text, addresses);
    setDraft({ text, value: next });
    onChange(next);
  }} />;
}
