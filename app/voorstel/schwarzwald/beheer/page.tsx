import type { Metadata } from "next";
import Link from "next/link";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { ACTIVITEITEN, BASE } from "@/lib/voorstel/schwarzwald";
import { beheerder } from "@/lib/voorstel/schwarzwald-accounts";
import { BeheerApp } from "@/components/voorstel/beheer/BeheerApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beheer" };

// De beheeromgeving van Het Schwarzwald. Toegang: een Schwarzwald-account met
// rol beheerder, of een ZekerFlex-platformbeheerder (die wijst de eerste
// beheerder aan onder Accounts).
export default async function SchwarzwaldBeheerPage() {
  const wie = await beheerder();

  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto max-w-[1280px] px-4 pb-10 pt-10 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Beheer</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Het Schwarzwald</h1>
          <p className="mt-3 max-w-xl text-schw-cream/80">Reserveringen, activiteiten, openingstijden, teksten en accounts: alles op één plek.</p>
        </div>
      </section>
      <section className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
        {wie ? (
          <BeheerApp namen={Object.fromEntries(ACTIVITEITEN.map((a) => [a.slug, a.naam]))} vandaag={amsterdamDayKey(new Date())} wie={wie.naam} />
        ) : (
          <div className="rounded-xl3 bg-white p-8 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
            <h2 className="font-display text-2xl font-bold">Alleen voor beheerders</h2>
            <p className="mt-2 text-schw-mute">Log in met een beheerdersaccount om verder te gaan.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`${BASE}/account`} className="rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream">
                Inloggen
              </Link>
              <Link href={`/login?callbackUrl=${encodeURIComponent(`${BASE}/beheer`)}`} className="rounded-full px-6 py-3 font-semibold ring-1 ring-schw-night/15">
                Inloggen als ZekerFlex-beheerder
              </Link>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
