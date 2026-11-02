import type { Metadata } from "next";
import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { ACTIVITEITEN, BASE } from "@/lib/voorstel/schwarzwald";
import { SchwarzwaldBeheer } from "@/components/voorstel/SchwarzwaldBeheer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agenda beheer" };

// De personeelskant van de eigen agenda. Voor het voorstel alleen voor
// platformbeheerders; bij livegang krijgt Het Schwarzwald een eigen account.
export default async function SchwarzwaldBeheerPage() {
  const principal = await getPrincipal();
  const magErin = !!principal && hasRole(principal, "PLATFORM_ADMIN");

  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto max-w-[1280px] px-4 pb-12 pt-12 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Beheer</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Agenda</h1>
          <p className="mt-3 max-w-xl text-schw-cream/80">Alle online reserveringen per dag. Bevestig of annuleer met één klik; de beschikbaarheid in de agenda past zich direct aan.</p>
        </div>
      </section>
      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-8">
        {magErin ? (
          <SchwarzwaldBeheer namen={Object.fromEntries(ACTIVITEITEN.map((a) => [a.slug, a.naam]))} vandaag={amsterdamDayKey(new Date())} />
        ) : (
          <div className="rounded-xl3 bg-white p-8 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
            <h2 className="font-display text-2xl font-bold">Alleen voor beheerders</h2>
            <p className="mt-2 text-schw-mute">Log in met een beheerdersaccount van ZekerFlex om de agenda te zien.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/login?callbackUrl=${encodeURIComponent(`${BASE}/beheer`)}`} className="rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream">
                Inloggen
              </Link>
              <Link href={`${BASE}/reserveren`} className="rounded-full px-6 py-3 font-semibold ring-1 ring-schw-night/15">
                Naar reserveren
              </Link>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
