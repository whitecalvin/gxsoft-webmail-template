import type { UserSettings } from "@/types/user-settings";
type Settings = UserSettings["notifications"];
export function validQuietTime(value: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function notificationAllowed(settings: Settings, now: Date, important: boolean): boolean {
  if (!settings.weekends && [0, 6].includes(now.getDay())) return false;
  if (settings.modes[important ? "important" : "general"] !== "instant") return false;
  if (!validQuietTime(settings.quietStart) || !validQuietTime(settings.quietEnd)) return false;
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minutes(settings.quietStart), end = minutes(settings.quietEnd), current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  return !(start < end ? current >= start && current < end : current >= start || current < end);
}

// 최초 로드, 편지함/페이지 전환, 오래된 메일 이동은 새 수신으로 간주하지 않는다.
export class NewMailDetector {
  private key = "";
  private ids = new Set<string>();
  private since = 0;
  observe(key: string, mails: { id: string; receivedAt: string; unread: boolean; starred: boolean }[], now: number) {
    if (key !== this.key) { this.key = key; this.ids = new Set(mails.map((mail) => mail.id)); this.since = now; return []; }
    const fresh = mails.filter((mail) => !this.ids.has(mail.id) && mail.unread && Date.parse(mail.receivedAt) > this.since && Date.parse(mail.receivedAt) <= now);
    for (const mail of mails) this.ids.add(mail.id);
    // 상태는 페이지 크기에 비례하도록 제한한다. 시간 경계가 재알림을 막는다.
    this.since = Math.max(this.since, ...fresh.map((mail) => Date.parse(mail.receivedAt)));
    if (this.ids.size > 1000) this.ids = new Set(mails.map((mail) => mail.id));
    return fresh;
  }
  reset() { this.key = ""; this.ids.clear(); this.since = 0; }
}
