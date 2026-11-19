import type { Metadata } from "next";
import Link from "next/link";
import { BASE, CONTACT, FUNCTIES, HERO, KLANTLOGIN, PAKKETTEN, STAPPEN, pakket } from "@/lib/voorstel/smileyapp";
import { TIJDEN, dagTekst, voorkeurDagen } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { leesBron } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { heeftTeam } from "@/lib/voorstel/smileyapp-accounts";
import { smileyappPakketten } from "@/lib/voorstel/smileyapp-pakketten";
import { AanvraagFormulier } from "@/components/voorstel/smileyapp/AanvraagFormulier";
import { Vinkje } from "@/components/voorstel/smileyapp/Blokken";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";
import { PakketKiezer } from "@/components/voorstel/smileyapp/PakketKiezer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vraag een demo aan" };

// Demo aanvragen (19 nov 2026): links wat Smileyapp doet (alleen teksten van
// hun eigen site, uit lib/voorstel/smileyapp.ts), rechts het formulier. De
// aanvraag komt in het beheer van SmileyApp; het gekozen moment is een voorkeur.
// ?pakket=<id> vanaf een prijskaart kiest dat pakket alvast. ?bron=<woord> (van de
// QR-code uit het beheer) gaat mee met de aanvraag, zodat het team ziet waar hij
// vandaan kwam. Boven het formulier staat de pakketkiezer als hulpje.
export default async function SmileyappDemo({ searchParams }: { searchParams: Promise<{ pakket?: string | string[]; bron?: string | string[] }> }) {
  const sp = await searchParams;
  const q = sp.pakket;
  const bron = leesBron(Array.isArray(sp.bron) ? sp.bron[0] : sp.bron);
  const [team, pakketten] = await Promise.all([heeftTeam(), smileyappPakketten()]);
  const gekozen = pakket(Array.isArray(q) ? q[0] : q, pakketten);
  // de dagen in Nederlandse tijd, op de server berekend: server en browser tonen dezelfde lijst
  const dagen = voorkeurDagen(new Date()).map((d) => ({ waarde: d, label: dagTekst(d) }));
  return (
    <>
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
        <Gezicht score={10} kleur="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-10 top-8 h-48 w-48 opacity-25 sm:right-16" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">Demo</p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.02em]">Vraag een demo aan</h1>
          <p className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-smiley-green">{HERO.intro[1]}</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:py-20">
        <div className="space-y-6">
          {gekozen && (
            <div className="rounded-[2rem] bg-smiley-sun p-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Demo van</p>
              <p className="mt-2 font-display text-2xl font-bold">{gekozen.naam}</p>
            </div>
          )}
          <div>
            <h2 className="font-display text-3xl font-bold leading-tight sm:text-4xl">Zo werkt Smileyapp</h2>
            <ol className="mt-6 space-y-4">
              {STAPPEN.map((s, i) => (
                <li key={s.titel} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-smiley-ink font-display text-lg font-bold text-smiley-sun">{i + 1}</span>
                  <span>
                    <span className="block font-display text-xl font-bold">{s.titel}</span>
                    <span className="mt-1 block leading-relaxed text-smiley-mute">{s.tekst}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[2rem] bg-smiley-mint p-6 sm:p-8">
            <h2 className="font-display text-2xl font-bold">{FUNCTIES.kop}</h2>
            <ul className="mt-5 space-y-3">
              {FUNCTIES.punten.map((f) => (
                <li key={f} className="flex gap-3 font-semibold">
                  <Vinkje />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm leading-relaxed text-smiley-mute">
            Liever eerst de pakketten vergelijken?{" "}
            <Link href={`${BASE}#pakketten`} className="font-semibold text-smiley-leaf underline underline-offset-2">
              Bekijk de pakketten
            </Link>
            . Al klant?{" "}
            <a href={KLANTLOGIN} className="font-semibold text-smiley-leaf underline underline-offset-2">
              Naar de klantlogin
            </a>
            .
          </p>
        </div>
        <div className="space-y-6">
        <PakketKiezer pakketten={pakketten} compact />
        <AanvraagFormulier
          key={gekozen?.id ?? "geen"}
          soort="demo"
          {...(bron ? { bron } : {})}
          kop="Plan je demo"
          mail={CONTACT.email}
          teamActief={team}
          pakketten={PAKKETTEN.map((p) => ({ waarde: p.id, label: p.naam }))}
          gekozenPakket={gekozen?.id ?? ""}
          dagen={dagen}
          tijden={TIJDEN}
        />
        </div>
      </section>
    </>
  );
}
