import { gmailOAuthGuideLinks, gmailOAuthSetupGuide } from "@/lib/gmail-oauth-setup-guide";
export function GmailOAuthGuideStep({ locale, index, origin, callback }: { locale: string; index: number; origin: string; callback: string }) {
  const g = gmailOAuthSetupGuide(locale), step = g.steps[index];
  if (!step) return null;
  return <>
    <ul className="list-disc space-y-2 py-2 pr-2 pl-7">{step.items.map(item => <li key={item}>{item}</li>)}</ul>
    {index === 3 && <div className="space-y-3 px-2 pb-3"><dl className="grid min-w-0 gap-3 rounded-(--radius-app) border border-(--border-app) p-3">{([[g.origins, origin], [g.redirects, callback]] as const).map(([label,value]) => <div key={label}><dt className="font-medium">{label}</dt><dd className="mt-1 min-w-0 break-all font-mono text-xs select-all">{value || g.missingOrigin}</dd></div>)}</dl><p className="text-xs text-(--text-muted)">{g.exact}</p></div>}
  </>;
}
export function GmailOAuthSetupGuide({ locale, origin, callback }: { locale: string; origin: string; callback: string }) {
  const g = gmailOAuthSetupGuide(locale);
  return <div className="min-w-0 space-y-4 text-sm leading-6">
    <p className="text-(--text-muted)">{g.introduction}</p>
    <ol className="divide-y divide-(--border-app)">{g.steps.map((step, index) => <li key={step.title} className="py-2">
      <details open={index === 0}><summary className="cursor-pointer rounded-(--radius-app) px-2 py-2 font-semibold hover:bg-(--surface-muted) focus-visible:outline-2 focus-visible:outline-(--focus-ring)">{index + 1}. {step.title}</summary>
        <GmailOAuthGuideStep locale={locale} index={index} origin={origin} callback={callback}/>
      </details>
    </li>)}</ol>
    <div className="space-y-2"><h3 className="font-semibold">{g.troubleshooting}</h3>{g.problems.map(problem => <details key={problem.title} className="border-t border-(--border-app) pt-1"><summary className="cursor-pointer rounded-(--radius-app) px-2 py-2 font-medium hover:bg-(--surface-muted) focus-visible:outline-2 focus-visible:outline-(--focus-ring)">{problem.title}</summary><p className="px-2 pt-1 pb-3 text-(--text-muted)">{problem.text}</p></details>)}</div>
    <nav aria-label={g.references} className="border-t border-(--border-app) pt-3"><h3 className="mb-2 font-semibold">{g.references}</h3><ul className="flex flex-wrap gap-x-4 gap-y-2">{gmailOAuthGuideLinks.map(([label,url]) => <li key={label}><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-(--radius-app) text-(--color-primary-ink) underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-(--focus-ring)">{g[label]}</a></li>)}</ul></nav>
  </div>;
}
