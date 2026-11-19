import type { Metadata } from "next";
import Image from "next/image";
import { CONTACT, INTERESSES, PARTNER } from "@/lib/voorstel/smileyapp";
import { heeftTeam } from "@/lib/voorstel/smileyapp-accounts";
import { AanvraagFormulier } from "@/components/voorstel/smileyapp/AanvraagFormulier";
import { Vinkje } from "@/components/voorstel/smileyapp/Blokken";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partner worden" };

// Het formulier werkt sinds 19 nov 2026: een aanmelding komt als soort "partner" in het beheer van SmileyApp.
export default async function SmileyappPartner() {
  const team = await heeftTeam();
  return (
    <>
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:py-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">Partner worden?</p>
            <h1 className="mt-3 font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.02em]">{PARTNER.kop}</h1>
            <p className="mt-5 text-xl font-semibold text-smiley-green">{PARTNER.sub}</p>
            <ul className="mt-9 grid gap-3 sm:grid-cols-3">
              {PARTNER.kort.map((k) => (
                <li key={k.titel} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 sm:flex-col sm:items-start">
                  <Image src={k.beeld} alt="" width={90} height={90} className="h-12 w-12" />
                  <span className="text-sm font-bold">{k.titel}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="sm-onthul overflow-hidden rounded-[2rem] ring-1 ring-white/10">
            <Image src={PARTNER.beeld} alt="Twee vuisten die elkaar raken: samenwerken" width={542} height={368} priority className="h-auto w-full" />
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:py-20">
        <div>
          <h2 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{PARTNER.uitlegKop}</h2>
          <div className="mt-5 space-y-4 text-lg leading-relaxed text-smiley-mute">
            {PARTNER.uitleg.map((u) => (
              <p key={u}>{u}</p>
            ))}
          </div>
          <ul className="mt-8 space-y-3.5">
            {PARTNER.voordelen.map((v) => (
              <li key={v} className="flex gap-3 font-semibold">
                <Vinkje />
                {v}
              </li>
            ))}
          </ul>
        </div>
        <AanvraagFormulier soort="partner" kop="Neem contact op om partner te worden" mail={CONTACT.email} teamActief={team} interesses={INTERESSES} />
      </section>
    </>
  );
}
