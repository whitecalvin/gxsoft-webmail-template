import type { Locale } from "@/i18n/routing";

// Inline vectors keep flags recognizable on Windows, which renders regional
// indicator emoji as country letters rather than color flags.
export function LocaleFlag({ locale }: { locale: Locale }) {
  const country = locale === "ko" ? "kr" : locale === "en" ? "us" : locale === "zh" ? "cn" : locale === "zh-hant" ? "tw" : locale;
  return (
    <svg aria-hidden="true" className="h-3 w-4.5 shrink-0 overflow-hidden rounded-xs ring-1 ring-black/10" viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg">
      {country === "kr" && <>
        <path fill="#fff" d="M0 0h24v16H0z" />
        <circle cx="12" cy="8" r="4" fill="#cd2e3a" />
        <path d="M8 8a4 4 0 0 0 8 0c-1 0-2 1-2 2a2 2 0 0 1-4 0c0-1-1-2-2-2Z" fill="#0047a0" />
        <path d="M2 3h5M2 4h5M2 5h5m15 6h5m-5 1h5m-5 1h5" stroke="#111" strokeWidth=".55" />
      </>}
      {country === "us" && <>
        <path fill="#fff" d="M0 0h24v16H0z" />
        {Array.from({ length: 7 }, (_, index) => <path key={index} fill="#b22234" d={`M0 ${index * 32 / 13}h24v${16 / 13}H0z`} />)}
        <path fill="#3c3b6e" d="M0 0h10v8.6H0z" />
        {[1.5, 4, 6.5].flatMap((y) => [1.5, 4, 6.5, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r=".35" fill="#fff" />))}
      </>}
      {country === "de" && <><path fill="#111" d="M0 0h24v5.34H0z" /><path fill="#dd0000" d="M0 5.33h24v5.34H0z" /><path fill="#ffce00" d="M0 10.66h24V16H0z" /></>}
      {country === "es" && <><path fill="#aa151b" d="M0 0h24v16H0z" /><path fill="#f1bf00" d="M0 4h24v8H0z" /><path fill="#aa151b" d="M7 5.5h2v5H7z" /><path fill="#fff" d="M7.5 6.4h1v2.8h-1z" /></>}
      {country === "fr" && <><path fill="#002395" d="M0 0h8v16H0z" /><path fill="#fff" d="M8 0h8v16H8z" /><path fill="#ed2939" d="M16 0h8v16h-8z" /></>}
      {country === "it" && <><path fill="#009246" d="M0 0h8v16H0z" /><path fill="#fff" d="M8 0h8v16H8z" /><path fill="#ce2b37" d="M16 0h8v16h-8z" /></>}
      {country === "pt" && <><path fill="#006600" d="M0 0h10v16H0z" /><path fill="#ff0000" d="M10 0h14v16H10z" /><circle cx="10" cy="8" r="4" fill="none" stroke="#ffcc33" strokeWidth="1" /><path fill="#fff" stroke="#b4242a" strokeWidth=".5" d="M8 5.5h4v4l-2 1.8-2-1.8z" /></>}
      {country === "ja" && <><path fill="#fff" d="M0 0h24v16H0z" /><circle cx="12" cy="8" r="4.2" fill="#bc002d" /></>}
      {country === "cn" && <><path fill="#de2910" d="M0 0h24v16H0z" /><polygon fill="#ffde00" points="5,2 5.6,4 7.7,4 6,5.2 6.6,7.2 5,6 3.4,7.2 4,5.2 2.3,4 4.4,4" /><circle cx="9" cy="2.5" r=".55" fill="#ffde00" /><circle cx="10.5" cy="4.3" r=".55" fill="#ffde00" /><circle cx="10.4" cy="6.5" r=".55" fill="#ffde00" /><circle cx="8.7" cy="8" r=".55" fill="#ffde00" /></>}
      {country === "tw" && <><path fill="#fe0000" d="M0 0h24v16H0z" /><path fill="#000095" d="M0 0h12v8H0z" /><circle cx="6" cy="4" r="2.4" fill="#fff" /><circle cx="6" cy="4" r="1.6" fill="#000095" /><circle cx="6" cy="4" r="1.2" fill="#fff" /></>}
    </svg>
  );
}
