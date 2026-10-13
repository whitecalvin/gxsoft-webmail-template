import { redirect } from "next/navigation";
import LoginPageClient from "@/components/auth/LoginPageClient";
import { tastemailRequest } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { validLiveJmapSession } from "@/lib/tastemail/session-contract";

export default async function LoginPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ reason?: string | string[] }>;
}) {
  const { locale } = await params;
  // 표시 목적의 닫힌 값만 읽는다. 인증 판단이나 이동 목적지로 사용하지 않는다.
  let sessionEnded = (await searchParams)?.reason === "session-ended";

  {
    const token = await tastemailSessionToken();
    if (token) {
      let authenticated = false;
      try {
        const response = await tastemailRequest("/.well-known/jmap", token);
        if (response.status === 401) sessionEnded = true;
        if (response.ok) {
          const session: unknown = await response.json();
          authenticated = validLiveJmapSession(session);
        }
      } catch {
        // Preserve access to the login form when the upstream is unavailable.
      }
      if (authenticated) redirect(`/${locale}`);
    }
  }

  return <LoginPageClient sessionEnded={sessionEnded} />;
}
