import type { MailRuleInput } from "./tastemail/mail-rules";

// 메시지 값은 URL/저장소로 넘기지 않고 편집기의 비활성 초안에만 사용한다.
export function mailRuleFromSender(sender: string, name: string): MailRuleInput | null {
  const address = sender.trim();
  if (!address || address.length > 254 || /[\x00-\x1f\x7f]/.test(address) || !/^[^\s@]+@[^\s@]+$/.test(address)) return null;
  const quoted = address.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return { id: null, name, kind: "filter", enabled: false,
    source: `if address :is "from" "${quoted}" {\n  keep;\n}\n` };
}
