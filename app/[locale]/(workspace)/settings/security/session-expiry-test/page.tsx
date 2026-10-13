import { notFound } from "next/navigation";
import { SessionExpiryTest } from "@/components/settings/SessionExpiryTest";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { loadLiveSecurity } from "@/lib/tastemail/security";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ sessionId?: string }> }) {
  const [{ locale }, { sessionId }] = await Promise.all([params, searchParams]);
  if (process.env.NODE_ENV !== "development" || locale !== "ko" || typeof sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sessionId)) notFound();
  const token = await tastemailSessionToken();
  if (!token) notFound();
  const current = (await loadLiveSecurity(token)).sessions.filter(item => item.current);
  if (current.length !== 1 || current[0].id !== sessionId) notFound();
  return <SessionExpiryTest sessionId={sessionId} />;
}
