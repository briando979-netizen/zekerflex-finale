"use client";

import { voorkeurTekst, type Aanvraag } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { dagEnTijd } from "@/lib/voorstel/smileyapp-agenda-regels";
import { KAART } from "@/components/voorstel/smileyapp/beheer/api";

// Het overzicht van het beheer: vier tegels met aantallen en daaronder "Te
// doen": alleen wat nu aandacht vraagt, elk met een knop naar het tabblad.

export type TabSleutel = "overzicht" | "demo" | "partners" | "agenda" | "gesprekken" | "cijfers" | "blog" | "reviews" | "vragen" | "vergelijken" | "pakketten" | "qr" | "team";

interface Punt {
  sleutel: string;
  tekst: string;
  tab: TabSleutel;
  knop: string;
}

export function Overzicht({
  aanvragen,
  chatWacht,
  team,
  vandaag,
  naar,
}: {
  aanvragen: readonly Aanvraag[];
  chatWacht: number;
  team: number;
  /** de Nederlandse dag van nu (JJJJ-MM-DD), van de server */
  vandaag: string;
  naar: (tab: TabSleutel) => void;
}) {
  const nieuw = (soort: Aanvraag["soort"]) => aanvragen.filter((a) => a.soort === soort && a.status === "nieuw").length;
  const demo = nieuw("demo");
  const partners = nieuw("partner");
  const bellen = aanvragen.filter((a) => a.voorkeur?.dag === vandaag && (a.status === "nieuw" || a.status === "gebeld"));

  const tegels: { label: string; aantal: number; tab: TabSleutel; let: boolean }[] = [
    { label: "Nieuwe demo-aanvragen", aantal: demo, tab: "demo", let: demo > 0 },
    { label: "Nieuwe partner-aanmeldingen", aantal: partners, tab: "partners", let: partners > 0 },
    { label: "Gesprekken die op een mens wachten", aantal: chatWacht, tab: "gesprekken", let: chatWacht > 0 },
    { label: "Teamleden", aantal: team, tab: "team", let: false },
  ];

  // demo's die vandaag in de agenda staan (Nederlandse dag en tijd), de vroegste eerst
  const demosVandaag = aanvragen
    .filter((a) => a.afspraak && dagEnTijd(a.afspraak.start).dag === vandaag && a.status === "afspraak")
    .sort((a, b) => ((a.afspraak?.start ?? "") < (b.afspraak?.start ?? "") ? -1 : 1));

  const punten: Punt[] = [
    ...demosVandaag.map((a) => ({ sleutel: `demo-${a.id}`, tekst: `Vandaag demo om ${a.afspraak ? dagEnTijd(a.afspraak.start).tijd : ""} uur: ${a.naam} van ${a.bedrijf}.`, tab: "agenda" as const, knop: "Naar de agenda" })),
    ...bellen.map((a) => ({ sleutel: `bel-${a.id}`, tekst: `Vandaag bellen: ${a.naam} van ${a.bedrijf}${a.voorkeur ? ` (${voorkeurTekst(a.voorkeur)})` : ""}.`, tab: "demo" as const, knop: "Naar de aanvraag" })),
    ...(demo > 0 ? [{ sleutel: "demo", tekst: demo === 1 ? "Er is 1 nieuwe demo-aanvraag. Bel of mail en zet de status daarna om." : `Er zijn ${demo} nieuwe demo-aanvragen. Bel of mail en zet de status daarna om.`, tab: "demo" as const, knop: "Demo-aanvragen" }] : []),
    ...(partners > 0 ? [{ sleutel: "partners", tekst: partners === 1 ? "Er is 1 nieuwe partner-aanmelding." : `Er zijn ${partners} nieuwe partner-aanmeldingen.`, tab: "partners" as const, knop: "Partners" }] : []),
    ...(chatWacht > 0 ? [{ sleutel: "chat", tekst: chatWacht === 1 ? "1 bezoeker vroeg in de chat om een medewerker." : `${chatWacht} bezoekers vroegen in de chat om een medewerker.`, tab: "gesprekken" as const, knop: "Gesprekken" }] : []),
    ...(team === 0 ? [{ sleutel: "team", tekst: "Er is nog niemand van SmileyApp uitgenodigd. Nodig de eerste beheerder uit.", tab: "team" as const, knop: "Team" }] : []),
  ];

  return (
    <div className="space-y-6">
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tegels.map((t) => (
          <li key={t.label}>
            <button type="button" onClick={() => naar(t.tab)} className={`block h-full w-full rounded-3xl p-5 text-left transition-transform hover:-translate-y-0.5 ${t.let ? "bg-smiley-sun text-smiley-ink" : "bg-white text-smiley-ink ring-1 ring-smiley-ink/5"}`}>
              <span className="block font-display text-4xl font-bold leading-none">{t.aantal}</span>
              <span className="mt-2 block text-sm font-semibold">{t.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <section aria-labelledby="sm-tedoen-kop" className={KAART}>
        <h3 id="sm-tedoen-kop" className="font-display text-xl font-bold text-smiley-ink">
          Te doen
        </h3>
        {punten.length === 0 ? (
          <p className="mt-3 text-smiley-mute">Niets wat op je wacht. Alle aanvragen zijn opgepakt.</p>
        ) : (
          <ul className="mt-3 divide-y divide-smiley-ink/10">
            {punten.map((p) => (
              <li key={p.sleutel} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0 break-words font-semibold">{p.tekst}</span>
                <button type="button" onClick={() => naar(p.tab)} className="shrink-0 rounded-full bg-smiley-ink px-4 py-2 text-sm font-bold text-white hover:bg-smiley-deep">
                  {p.knop}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
