"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { UitloggenFormulier } from "@/components/app/UitloggenFormulier";
import { COMMUNITY_URL } from "@/lib/hulp/hulpjes";
import { isStandaloneBrowser, PLAY_TEST_URL, PWA_COOKIE, PWA_COOKIE_MAX_AGE, TESTFLIGHT_URL, TESTGROEP_URL } from "@/lib/app-vereist";

/** Het installatievoorstel van Chrome/Edge op Android (en computer): niet in de standaard DOM-typen. */
interface InstallVoorstel extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Het scherm dat een werker in een gewone browser ziet in plaats van het dashboard (21 nov 2026, zoals YoungOnes):
 * installeer de app. Draait de pagina al als geïnstalleerde web-app, dan zet dit scherm de cookie en herlaadt: de
 * server toont dan het dashboard. Vaste donkere kleuren (hetzelfde in elk thema); teksten in vijf talen (appVereist).
 * 22 nov 2026 (eigenaar: "makkelijk de app installeren" en "een link naar de community"): eerst de snelste weg (op het
 * beginscherm, met de installeerknop van de browser als die er is), dan de winkels (Android in twee stappen via de
 * testgroep, zonder mailen), dan de community.
 */
export function AppVereist({ werkgever = false }: { werkgever?: boolean }) {
  const t = useFT().appVereist;
  const [herladen, setHerladen] = useState(false);
  const [voorstel, setVoorstel] = useState<InstallVoorstel | null>(null);

  useEffect(() => {
    if (!isStandaloneBrowser(window)) return;
    try {
      document.cookie = `${PWA_COOKIE}=1; path=/; max-age=${PWA_COOKIE_MAX_AGE}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    } catch {
      /* zonder cookie blijft het scherm staan */
    }
    setHerladen(true);
    window.location.reload();
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

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[#121418] text-white">
      <div className="bg-[linear-gradient(160deg,#0A1446_0%,#0E3A62_55%,#0F5566_100%)] px-6 pb-12 pt-10">
        <p className="font-display text-sm font-extrabold uppercase tracking-wide text-[#14D9C9]">ZekerFlex</p>
        <h1 className="mt-4 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-4xl">{t.kop}</h1>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8">
        <p className="text-base leading-relaxed text-white/85">{herladen ? t.openen : t.tekst}</p>

        <section className="mt-8 rounded-2xl border border-[#14D9C9]/40 bg-[#14D9C9]/10 p-5">
          <h2 className="font-display text-lg font-extrabold uppercase text-[#14D9C9]">{t.snelKop}</h2>
          <p className="mt-1 text-sm text-white/75">{t.snelTekst}</p>
          {voorstel && (
            <button
              type="button"
              onClick={() => void installeer()}
              className="mt-4 flex min-h-[56px] w-full items-center justify-between rounded-xl bg-[#14D9C9] px-5 text-base font-bold text-[#0B1238]"
            >
              <span>{t.installeerKnop}</span>
              <span aria-hidden>↓</span>
            </button>
          )}
          <ul className="mt-4 space-y-2 text-sm leading-snug text-white/85">
            <li>{t.iphoneStap}</li>
            <li>{t.androidStap}</li>
            <li className="text-white/60">{t.computerStap}</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-base font-extrabold uppercase text-white">{t.winkelKop}</h2>
          <div className="mt-3 space-y-3">
            <a href={TESTGROEP_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-[52px] w-full items-center justify-between rounded-xl border-2 border-white/70 px-5 text-sm font-bold text-white">
              <span>{t.groepStap}</span>
              <span aria-hidden>›</span>
            </a>
            <a href={PLAY_TEST_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-[52px] w-full items-center justify-between rounded-xl border-2 border-white/70 px-5 text-sm font-bold text-white">
              <span>{t.android}</span>
              <span aria-hidden>›</span>
            </a>
            <p className="text-xs leading-snug text-white/60">{t.androidUitleg}</p>
            <a href={TESTFLIGHT_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-[52px] w-full items-center justify-between rounded-xl border-2 border-white/70 px-5 text-sm font-bold text-white">
              <span>{t.iphone}</span>
              <span aria-hidden>›</span>
            </a>
            <p className="text-xs leading-snug text-white/60">{t.iphoneUitleg}</p>
          </div>
        </section>

        <div className="mt-8 rounded-xl bg-[#1C1F26] p-4 text-sm leading-relaxed text-white/80">
          <p className="font-display font-extrabold uppercase text-white">{t.alKop}</p>
          <p className="mt-1">{t.alTekst}</p>
        </div>

        <Link href={COMMUNITY_URL} className="mt-4 block rounded-xl bg-[#1C1F26] p-4 text-sm leading-relaxed text-white/80">
          <span className="block font-display font-extrabold uppercase text-white">{t.communityKop}</span>
          <span className="mt-1 block">{t.communityTekst}</span>
          <span className="mt-2 block font-semibold text-[#14D9C9] underline underline-offset-4">{t.communityKnop} ›</span>
        </Link>

        <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-10 text-sm">
          {werkgever && (
            <Link href="/werkgever" className="font-semibold text-[#14D9C9] underline underline-offset-4">
              {t.werkgever}
            </Link>
          )}
          <Link href="/" className="font-semibold text-white/70 underline underline-offset-4">
            {t.site}
          </Link>
          <UitloggenFormulier className="inline">
            <button type="submit" className="font-semibold text-white/70 underline underline-offset-4">
              {t.uitloggen}
            </button>
          </UitloggenFormulier>
        </div>
      </div>
    </main>
  );
}