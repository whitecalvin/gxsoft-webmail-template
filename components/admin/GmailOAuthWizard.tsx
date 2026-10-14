"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X, ArrowLeft, ArrowRight } from "lucide-react";
import { gmailOAuthSetupGuide, gmailOAuthGuideLinks } from "@/lib/gmail-oauth-setup-guide";
import { Modal } from "@/components/overlay/Modal";
import { DialogActions } from "@/components/overlay/DialogActions";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { GmailOAuthGuideStep } from "./GmailOAuthSetupGuide";
export function GmailOAuthWizard({ locale, origin, callback, onClose }: { locale: string; origin: string; callback: string; onClose: () => void }) {
  const g = gmailOAuthSetupGuide(locale), ko = locale === "ko";
  const labels = { title: ko ? "Gmail OAuth 설정 마법사" : "Gmail OAuth setup wizard", previous: ko ? "이전" : "Previous", next: ko ? "다음" : "Next", close: ko ? "닫기" : "Close", end: ko ? "안내 닫기" : "Close guide", navigation: ko ? "설정 단계" : "Setup steps", note: ko ? "안내를 끝까지 읽어도 설정이 저장되거나 Gmail 인증이 완료되지는 않습니다. 관리자 설정 저장과 사용자 인증은 별도로 진행하세요." : "Finishing this guide does not save settings or authenticate Gmail. Save administrator settings and complete user authentication separately." };
  const [step, setStep] = useState(0), id = useId(), heading = useRef<HTMLHeadingElement>(null), body = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.focus(); body.current?.scrollTo({ top: 0 }); }, [step]);
  const changeStep = (target: number) => setStep(Math.max(0, Math.min(g.steps.length - 1, target)));
  return <Modal onClose={onClose} maxWidth={760} labelledBy={`${id}-title`} describedBy={`${id}-note`} className="flex max-h-[calc(100dvh-2rem)] flex-col">
    <header className="flex shrink-0 items-center gap-3 border-b border-(--border-app) px-4 py-3 sm:px-6"><h2 id={`${id}-title`} className="min-w-0 flex-1 text-base font-semibold">{labels.title}</h2><Tooltip content={labels.close}><Button variant="ghost" size="icon" aria-label={labels.close} onClick={onClose}><X size={18}/></Button></Tooltip></header>
    <nav aria-label={labels.navigation} className="shrink-0 border-b border-(--border-app) px-4 py-3 sm:px-6"><ol className="flex items-center justify-between gap-1">{g.steps.map((item,index) => <li key={item.title}><Tooltip content={item.title}><Button variant={step === index ? "primary" : "ghost"} size="icon" aria-label={`${index + 1}. ${item.title}`} aria-current={step === index ? "step" : undefined} aria-controls={`${id}-content`} onClick={() => changeStep(index)}>{index + 1}</Button></Tooltip></li>)}</ol></nav>
    <div id={`${id}-content`} ref={body} className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 text-sm leading-6 sm:p-6">
      <p className="text-xs text-(--text-muted)" role="status" aria-live="polite">{labels.navigation} {step + 1} / {g.steps.length}</p>
      <h3 ref={heading} data-modal-autofocus tabIndex={-1} className="rounded-(--radius-app) text-base font-semibold outline-none focus-visible:outline-2 focus-visible:outline-(--focus-ring)">{g.steps[step].title}</h3>
      {step === 0 && <p className="text-(--text-muted)">{g.introduction}</p>}
      <GmailOAuthGuideStep locale={locale} index={step} origin={origin} callback={callback}/>
      {step === g.steps.length - 1 && <p className="rounded-(--radius-app) bg-(--surface-muted) p-3 text-(--text-muted)">{labels.note}</p>}
      <a href={gmailOAuthGuideLinks[step === 0 ? 0 : step === 1 ? 1 : step === 2 ? 4 : step === 3 ? 2 : 3][1]} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-(--radius-app) text-(--color-primary-ink) underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-(--focus-ring)">{step === 0 ? g.console : g.references}</a>
    </div>
    <footer className="shrink-0 space-y-3 border-t border-(--border-app) px-4 py-3 sm:px-6"><p id={`${id}-note`} className="text-xs text-(--text-muted)">{labels.note}</p><DialogActions><Button disabled={step === 0} onClick={() => changeStep(step - 1)} leadingIcon={<ArrowLeft size={16}/>}>{labels.previous}</Button>{step < g.steps.length - 1 && <Button variant="primary" onClick={() => changeStep(step + 1)} trailingIcon={<ArrowRight size={16}/>}>{labels.next}</Button>}<Button variant={step === g.steps.length - 1 ? "primary" : "secondary"} onClick={onClose}>{step === g.steps.length - 1 ? labels.end : labels.close}</Button></DialogActions></footer>
  </Modal>;
}
