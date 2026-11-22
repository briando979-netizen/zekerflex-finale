"use client";

import { useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { QrCode } from "@/components/billing/QrCode";
import { APP_PAGINA_URL, PLAY_TEST_URL, TESTFLIGHT_URL, TESTGROEP_URL, toestelVan, type Toestel } from "@/lib/app-vereist";

/** Het installatievoorstel van Chrome/Edge op Android (en computer): niet in de standaard DOM-typen. */
interface InstallVoorstel extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const KNOP_OMLIJND = "flex min-h-[52px] w-full items-center justify-between rounded-xl border-2 border-white/70 px-5 text-sm font-bold text-white";

/**
 * De weg naar de app, per toestel één (22 nov 2026, gebruikersonderzoek: een iPhone zag ook de Android-stappen, en op de
 * computer stond alleen "open dit op je telefoon"). iPhone: op het beginscherm of TestFlight. Android: de installeerknop van de
 * browser of het menu, dan de testgroep en Google Play. Computer: een QR-code naar zekerflex.com/app. Het toestel bepalen we
 * pas in de browser (useEffect), zodat de server en de browser hetzelfde tekenen. Vaste donkere kleuren: het scherm
 * "Installeer de app" (AppVereist) en de kaart op Ontdekken (AppVoorstelKaart) zijn in elk thema donker.
 */
export function AppInstallatie() {
  const t = useFT().appVereist;
  const [toestel, setToestel] = useState<Toestel | null>(null);
  const [voorstel, setVoorstel] = useState<InstallVoorstel | null>(null);

  useEffect(() => {
    setToestel(toestelVan(navigator));
  }, []);

  // de browser biedt de installatie zelf aan (Chrome/Edge): bewaar het voorstel voor de knop
  useEffect(() => {
    const opVoorstel = (e: Event) => {
      e.preventDefault();
      setVoorstel(e as InstallVoorstel);
    };
    window.addEventListener("beforeinstallprompt", opVoorstel);
    return () => window.removeEventListener("beforeinstallprompt", opVoorstel);
  }, []);

  async function installeer() {
    if (!voorstel) return;
    try {
      await voorstel.prompt();
      await voorstel.userChoice;
    } catch {
      /* de browser weigerde: de uitleg hieronder blijft staan */
    }
    setVoorstel(null);
  }

  if (toestel === null) return null;

  if (toestel === "computer") {
    return (
      <section className="rounded-2xl border border-[#14D9C9]/40 bg-[#14D9C9]/10 p-5">
        <h2 className="font-display text-lg font-extrabold uppercase text-[#14D9C9]">{t.qrKop}</h2>
        <p className="mt-1 text-sm text-white/75">{t.qrTekst}</p>
        <div className="mt-4 inline-block rounded-xl bg-[#ffffff] p-2">
          <QrCode value={APP_PAGINA_URL} size={168} label={t.qrLabel} />
        </div>
        <p className="mt-2 text-sm font-semibold text-white">zekerflex.com/app</p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#14D9C9]/40 bg-[#14D9C9]/10 p-5">
        <h2 className="font-display text-lg font-extrabold uppercase text-[#14D9C9]">{t.snelKop}</h2>
        <p className="mt-1 text-sm text-white/75">{t.snelTekst}</p>
        {voorstel && toestel === "android" && (
          <button
            type="button"
            onClick={() => void installeer()}
            className="mt-4 flex min-h-[56px] w-full items-center justify-between rounded-xl bg-[#14D9C9] px-5 text-base font-bold text-[#0B1238]"
          >
            <span>{t.installeerKnop}</span>
            <span aria-hidden>↓</span>
          </button>
        )}
        <p className="mt-4 text-sm leading-snug text-white/85">{toestel === "iphone" ? t.iphoneStap : t.androidStap}</p>
      </section>

      <section>
        <h2 className="font-display text-base font-extrabold uppercase text-white">{t.winkelKop}</h2>
        {toestel === "iphone" ? (
          <div className="mt-3 space-y-3">
            <a href={TESTFLIGHT_URL} target="_blank" rel="noopener noreferrer" className={KNOP_OMLIJND}>
              <span>{t.iphone}</span>
              <span aria-hidden>›</span>
            </a>
            <p className="text-xs leading-snug text-white/60">{t.iphoneUitleg}</p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <a href={TESTGROEP_URL} target="_blank" rel="noopener noreferrer" className={KNOP_OMLIJND}>
              <span>{t.groepStap}</span>
              <span aria-hidden>›</span>
            </a>
            <a href={PLAY_TEST_URL} target="_blank" rel="noopener noreferrer" className={KNOP_OMLIJND}>
              <span>{t.android}</span>
              <span aria-hidden>›</span>
            </a>
            <p className="text-xs leading-snug text-white/60">{t.androidUitleg}</p>
          </div>
        )}
      </section>
    </div>
  );
}
