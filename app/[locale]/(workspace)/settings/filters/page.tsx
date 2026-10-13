import { redirect } from "next/navigation";

// Preserve old bookmarks without maintaining a second rules editor route.
export default async function FiltersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/settings/rules`);
}
