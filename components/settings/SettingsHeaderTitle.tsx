import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SettingsHeaderTitle({ title }: { title: string }) {
  const t = useTranslations("settingsSystem");
  const parent = t("title");
  const isLanding = title === parent;
  return (
    <nav aria-label={parent} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5">
        {isLanding ? <li aria-current="page" className="min-w-0 truncate font-bold">{parent}</li> : <>
          <li className="shrink-0 font-medium text-(--text-muted)"><Link href="/settings">{parent}</Link></li>
          <li aria-hidden="true" className="shrink-0 text-(--text-muted)"><ChevronRight size={14} /></li>
          <li aria-current="page" className="min-w-0 truncate font-bold">{title}</li>
        </>}
      </ol>
    </nav>
  );
}
