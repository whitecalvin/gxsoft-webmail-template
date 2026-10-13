import "server-only";
import { headers } from "next/headers";
import { tastemailRequest } from "./server";
import { tastemailSessionToken } from "./session";
import { validLiveJmapSession } from "./session-contract";
import { loadLiveEvents } from "./calendar";
import { loadLiveContacts } from "./contacts";
import { loadLiveSharedMailboxes } from "./shared-mailboxes";
import { initialCalendarRange } from "../workspace-initial-data";

// Cookie-backed requests remain request-scoped; never cache one account's data globally.
async function initialData<T>(load: (token: string) => Promise<T>): Promise<T | null> {

  // 내부 이동·프리페치·router.refresh는 HTML 초기 진입이 아닌 RSC 요청이다.
  // 이때 서버에서 초기 데이터를 재조회하지 않고 기존 CSR 조회 경로를 사용한다.
  if ((await headers()).get("rsc") === "1") return null;
  const token = await tastemailSessionToken();
  if (!token) return null;
  try { return await load(token); }
  catch { return null; } // Preserve the existing authenticated CSR error/retry flow.
}

export function loadInitialCalendar() {
  return initialData(async token => {
    const range = initialCalendarRange(new Date());
    const [events, response] = await Promise.all([loadLiveEvents(token, range.from, range.to), tastemailRequest("/.well-known/jmap", token)]);
    if (!response.ok) throw new Error("unavailable");
    const session: unknown = await response.json();
    if (!validLiveJmapSession(session)) throw new Error("unavailable");
    return { date: range.date, month: range.month, events, username: session.username };
  });
}
export const loadInitialContacts = () => initialData(loadLiveContacts);
export const loadInitialSharedMailboxes = () => initialData(loadLiveSharedMailboxes);
