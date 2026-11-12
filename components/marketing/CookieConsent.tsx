"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cookieStringIsApp } from "@/lib/app-mode";

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
  return v && Object.hasOwn(COPY, v) ? (v as CopyLocale) : "nl";
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
  const pad = usePathname();

  useEffect(() => {
    setLocale(readLocale());
    // Niet vanzelf op de welkomstpagina van de app en niet in de app zelf: daar bedekt hij de knoppen
    // "Account aanmaken" en "Inloggen". We plaatsen alleen functionele cookies (zie hieronder), dus er
    // valt niets te kiezen; het cookiebeleid blijft bereikbaar en "instellingen" opent hem nog steeds.
    const inApp = cookieStringIsApp(document.cookie);
    const opWelkom = pad === "/welkom" || (pad ?? "").startsWith("/welkom/");
    setVisible(!readConsentCookie() && !inApp && !opWelkom);
  }, [pad]);

  useEffect(() => {
    const reopen = () => {
      setShowDetails(true);
      setVisible(true);
    };
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  // Ruimte onderaan zolang de melding open staat, even hoog als de melding: anders ligt de laatste knop van een
  // pagina eronder, ook helemaal naar beneden gescrold (12 nov: "Organisatie aanmelden" op /register op een
  // telefoon van 390×844 was niet aan te tikken zonder eerst de melding weg te klikken).
  // Niet op ZekerFlex OS (/os): dat bureaublad vult het scherm, ruimte eronder gaf daar alleen een schuifbalk.
  const opOs = pad === "/os" || (pad ?? "").startsWith("/os/");
  const laag = useRef<HTMLDivElement>(null);
  const [ruimte, setRuimte] = useState(0);
  useEffect(() => {
    const el = laag.current;
    if (!visible || !el) return;
    const meet = () => setRuimte(Math.ceil(el.getBoundingClientRect().height));
    meet();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible]);

  function dismiss() {
    writeConsentCookie();
    setVisible(false);
    setShowDetails(false);
  }

  if (!visible) return null;

  return (
    <>
    {/* de ruimte onderaan (zie hierboven); verdwijnt met de melding */}
    {!opOs && <div aria-hidden data-cookie-ruimte style={{ height: ruimte }} />}
    {/* De laag is schermbreed, de kaart niet: klikken naast de kaart gaan door naar wat eronder ligt
        (zoals de chatknop rechtsonder); alleen de kaart zelf vangt ze op. */}
    <div ref={laag} className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] px-4 pb-4 sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-2xl rounded-2xl border border-hair bg-white p-5 shadow-lift">
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
    </>
  );
}
