"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const COOKIE_NAME = "zf_cookie_consent";
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

  useEffect(() => {
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
          We gebruiken alleen functionele cookies — nodig om in te loggen en je voorkeuren te onthouden. Geen
          advertentie- of trackingcookies.{" "}
          <Link href="/cookiebeleid" className="font-semibold underline">
            Lees het volledige cookiebeleid
          </Link>
          .
        </p>

        {showDetails && (
          <div className="mt-3 rounded-xl bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
            <p>
              Er is niets uit te zetten: we plaatsen geen cookies waarvoor toestemming nodig is. De enige cookies
              zijn je sessie, je taal-/weergavevoorkeur en deze cookiekeuze zelf.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={dismiss} className="btn-primary text-sm">
            Accepteren
          </button>
          {!showDetails ? (
            <button type="button" onClick={() => setShowDetails(true)} className="btn-ghost text-sm">
              Instellingen
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Sluiten"
            className="ml-auto text-sm text-neutralx-500 hover:text-ink"
          >
            Sluiten ✕
          </button>
        </div>
      </div>
    </div>
  );
}
