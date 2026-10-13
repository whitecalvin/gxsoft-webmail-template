import { redirect } from "next/navigation";
// Accounts are provisioned through the authenticated administrator API.
export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; redirect(`/${locale}/login`); }
