"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const COOKIE_NAME = "zf_cookie_consent";

// The first thing a new visitor sees — in their chosen language (zf_locale cookie).
const COPY = {
  nl: { body: "We gebruiken alleen functionele cookies — nodig om in te loggen en je voorkeuren te onthouden. Geen advertentie- of trackingcookies.", policy: "Lees het volledige cookiebeleid", details: "Er is niets uit te zetten: we plaatsen geen cookies waarvoor toestemming nodig is. De enige cookies zijn je sessie, je taal-/weergavevoorkeur en deze cookiekeuze zelf. Wel meten we anoniem en zonder cookies hoe lang pagina's bekeken worden, zodat we de site kunnen verbeteren — zonder persoonsgegevens en zonder externe partijen.", accept: "Accepteren", settings: "Instellingen", close: "Sluiten" },
  en: { body: "We only use functional cookies — needed to log in and remember your preferences. No advertising or tracking cookies.", policy: "Read the full cookie policy", details: "There is nothing to switch off: we set no cookies that require consent. The only cookies are your session, your language/display preference and this cookie choice itself. We do measure anonymously, without cookies, how long pages are viewed to improve the site — no personal data, no third parties.", accept: "Accept", settings: "Settings", close: "Close" },
  pl: { body: "Używamy wyłącznie funkcjonalnych plików cookie — potrzebnych do logowania i zapamiętania ustawień. Żadnych reklamowych ani śledzących.", policy: "Przeczytaj pełną politykę cookies", details: "Nie ma nic do wyłączenia: nie używamy plików cookie wymagających zgody. Jedyne pliki cookie to Twoja sesja, preferencja języka/wyglądu i ten wybór.", accept: "Akceptuję", settings: "Ustawienia", close: "Zamknij" },
  ro: { body: "Folosim doar cookie-uri funcționale — necesare pentru conectare și pentru a-ți reține preferințele. Fără cookie-uri de publicitate sau urmărire.", policy: "Citește politica completă de cookie-uri", details: "Nu e nimic de dezactivat: nu folosim cookie-uri care necesită consimțământ. Singurele cookie-uri sunt sesiunea, preferința de limbă/afișare și această alegere.", accept: "Accept", settings: "Setări", close: "Închide" },
  uk: { body: "Ми використовуємо лише функціональні cookie — потрібні для входу та збереження налаштувань. Жодних рекламних чи відстежувальних.", policy: "Прочитати повну політику cookie", details: "Тут нічого вимикати: ми не встановлюємо cookie, що потребують згоди. Єдині cookie — твоя сесія, мова/вигляд і цей вибір.", accept: "Прийняти", settings: "Налаштування", close: "Закрити" },
} as const;
type CopyLocale = keyof typeof COPY;

function readLocale(): CopyLocale {
  if (typeof document === "undefined") return "nl";
  const v = document.cookie.split("; ").find((c) => c.startsWith("zf_locale="))?.split("=")[1];
  return v && v in COPY ? (v as CopyLocale) : "nl";
}
const REOPEN_EVENT = "zf:open-cookie-settings";

function readConsentCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE_NAME}=`));
}

function writeConsentCookie() {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${oneYear}; samesite=lax`;
}

/**
 * The banner the cookiebeleid page already describes ("bij je eerste bezoek
 * tonen we een korte melding... onthoudt... welke keuze je hebt gemaakt") but
 * that never actually existed in the code. Since the platform only ever sets
 * strictly necessary functional cookies (no tracking/marketing — see
 * /cookiebeleid §5.3), "instellingen" has nothing to toggle; it honestly
 * explains that instead of faking a preference matrix for cookies that don't
 * exist. Reopenable from anywhere via the "zf:open-cookie-settings" event
 * (see CookieSettingsButton) — e.g. the shop and main footers.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [locale, setLocale] = useState<CopyLocale>("nl");
  const c = COPY[locale];

  useEffect(() => {
    setLocale(readLocale());
    if (!readConsentCookie()) setVisible(true);
    const reopen = () => {
      setShowDetails(true);
      setVisible(true);
    };
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  function dismiss() {
    writeConsentCookie();
    setVisible(false);
    setShowDetails(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] px-4 pb-4 sm:px-6">
      <div className="mx-auto max-w-2xl rounded-2xl border border-hair bg-white p-5 shadow-lift">
        <p className="text-sm leading-relaxed text-ink">
          {c.body}{" "}
          <Link href="/cookiebeleid" className="font-semibold underline">
            {c.policy}
          </Link>
          .
        </p>

        {showDetails && (
          <div className="mt-3 rounded-xl bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
            <p>{c.details}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={dismiss} className="btn-primary text-sm">
            {c.accept}
          </button>
          {!showDetails ? (
            <button type="button" onClick={() => setShowDetails(true)} className="btn-ghost text-sm">
              {c.settings}
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            aria-label={c.close}
            className="ml-auto text-sm text-neutralx-500 hover:text-ink"
          >
            {c.close} ✕
          </button>
        </div>
      </div>
    </div>
  );
}
