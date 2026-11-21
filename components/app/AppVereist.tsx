"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { UitloggenFormulier } from "@/components/app/UitloggenFormulier";
import { isStandaloneBrowser, PLAY_TEST_URL, PWA_COOKIE, PWA_COOKIE_MAX_AGE, TESTFLIGHT_URL } from "@/lib/app-vereist";

/**
 * Het scherm dat een werker in een gewone browser ziet in plaats van het dashboard (21 nov 2026, zoals YoungOnes):
 * installeer de app. Draait de pagina al als geïnstalleerde web-app, dan zet dit scherm de cookie en herlaadt: de
 * server toont dan het dashboard. Vaste donkere kleuren (hetzelfde in elk thema); teksten in vijf talen (appVereist).
 */
export function AppVereist({ werkgever = false }: { werkgever?: boolean }) {
  const t = useFT().appVereist;
  const [herladen, setHerladen] = useState(false);

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

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[#121418] text-white">
      <div className="bg-[linear-gradient(160deg,#0A1446_0%,#0E3A62_55%,#0F5566_100%)] px-6 pb-12 pt-10">
        <p className="font-display text-sm font-extrabold uppercase tracking-wide text-[#14D9C9]">ZekerFlex</p>
        <h1 className="mt-4 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-4xl">{t.kop}</h1>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8">
        <p className="text-base leading-relaxed text-white/85">{herladen ? t.openen : t.tekst}</p>
        <div className="mt-8 space-y-3">
          <a href={PLAY_TEST_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] w-full items-center justify-between rounded-xl bg-[#14D9C9] px-5 text-base font-bold text-[#0B1238]">
            <span>{t.android}</span>
            <span aria-hidden>›</span>
          </a>
          <p className="text-xs leading-snug text-white/60">{t.androidUitleg}</p>
          <a href={TESTFLIGHT_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] w-full items-center justify-between rounded-xl border-2 border-white/70 px-5 text-base font-bold text-white">
            <span>{t.iphone}</span>
            <span aria-hidden>›</span>
          </a>
          <p className="text-xs leading-snug text-white/60">{t.iphoneUitleg}</p>
        </div>
        <div className="mt-8 rounded-xl bg-[#1C1F26] p-4 text-sm leading-relaxed text-white/80">
          <p className="font-display font-extrabold uppercase text-white">{t.alKop}</p>
          <p className="mt-1">{t.alTekst}</p>
        </div>
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
