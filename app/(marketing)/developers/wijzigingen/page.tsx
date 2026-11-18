import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/marketing/primitives";
import { canonical, SITE } from "@/lib/seo";

const TITLE = "Wijzigingen — de ZekerFlex-API";
const DESCRIPTION =
  "Het logboek van de openbare ZekerFlex-API: nieuwe endpoints, verbeteringen en afspraken. Belangrijke wijzigingen kondigen we hier vooraf aan.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/developers/wijzigingen", { title: TITLE, description: DESCRIPTION }),
};

interface Entry {
  datum: string;
  versie?: string;
  titel: string;
  punten: string[];
}

// Eerlijk en kort: alleen wat er echt is. Geen verzonnen historie.
const ENTRIES: Entry[] = [
  {
    datum: "18 november 2026",
    titel: "Ontwikkelaarsportaal en API-naslag",
    punten: [
      "Nieuw portaal onder /developers met een losse API-naslag per endpoint (velden, foutcodes, limieten en voorbeelden).",
      "De machineleesbare specificatie blijft op /openapi.json en is de enige bron voor tools.",
    ],
  },
  {
    datum: "Huidige versie",
    versie: "1.0.0",
    titel: "De openbare API",
    punten: [
      "Diensten: open diensten lezen (GET /shifts), een dienst aanmaken (POST /shifts) en één dienst opvragen (GET /shifts/{id}).",
      "Uren: goedgekeurde en betaalde urenbriefjes lezen (GET /timesheets/approved).",
      "Facturen: facturen aan je organisatie lezen (GET /invoices).",
      "Webhooks: een URL registreren voor meldingen (POST /webhooks), met een ondertekeningsgeheim.",
      "Agendafeed: een iCal-abonnement met al je diensten (geen sleutel nodig, token in de link).",
      "Sleutels met vaste rechten, een limiet per abonnement en RateLimit-headers op elk antwoord.",
    ],
  },
];

export default function ApiChangelogPage() {
  return (
    <>
      <div className="border-b border-hair bg-paper-soft">
        <div className="shell py-12 md:py-14">
          <p className="eyebrow text-brand-600">Ontwikkelaars</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-ink md:text-[2.4rem]">Wijzigingen</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">
            Het logboek van de {SITE.name}-API. Belangrijke of ingrijpende wijzigingen kondigen we hier minstens 14 dagen van
            tevoren aan, zodat je koppeling nooit zomaar omvalt.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <ol className="relative max-w-2xl border-l border-hair pl-6">
          {ENTRIES.map((e) => (
            <li key={`${e.datum}-${e.titel}`} className="relative mb-10 last:mb-0">
              <span className="absolute -left-[31px] top-1 grid h-4 w-4 place-items-center rounded-full bg-brand-500 ring-4 ring-paper" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-neutralx-500">{e.datum}</span>
                {e.versie ? (
                  <code className="rounded-full bg-ink px-2 py-0.5 font-mono text-xs font-bold text-white">v{e.versie}</code>
                ) : null}
              </div>
              <h2 className="mt-1 font-display text-lg font-bold text-ink">{e.titel}</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[0.975rem] leading-relaxed text-neutralx-600">
                {e.punten.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="mt-10 max-w-2xl text-sm text-neutralx-600">
          Alle endpoints en velden staan in de{" "}
          <Link href="/developers/api" className="font-semibold text-brand-700 hover:underline">API-naslag</Link>. De volledige
          specificatie staat op <a href="/openapi.json" className="font-semibold text-brand-700 hover:underline">/openapi.json</a>.
        </p>
      </Section>
    </>
  );
}
