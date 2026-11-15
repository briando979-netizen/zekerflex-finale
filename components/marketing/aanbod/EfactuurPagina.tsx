import Link from "next/link";
import type { AanbodItem } from "@/lib/marketing/aanbod";
import { EFACTUUR_FAQ, EFACTUUR_FUNCTIES, EFACTUUR_STAPPEN, EFACTUUR_ZIT_ERIN } from "@/lib/marketing/efactuur-pagina";

// De pagina E-facturatie (/aanbod/e-facturatie), opgebouwd zoals een softwarepagina met een product om te laten zien
// (15 nov 2026, eigenaar: "dezelfde weergave als de factuurpagina van Jortt"): kop met een voorbeeld van het product,
// vier stappen, de factuur zelf, de stand per factuur, wat erin zit, telefoon, prijs, vragen en een oproep. Met onze eigen
// teksten en alleen wat nu echt kan (lib/marketing/efactuur-pagina.ts): Peppol staat er als "komt eraan" tot er een
// toegangspunt is (owner-todo), en er staat geen betaalverzoek of bank in (ZekerFlex Bank staat uit).

const Vink = ({ className = "text-brand-500" }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`mt-1 shrink-0 ${className}`}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/** Voorbeeld van een factuur met de e-factuurstand ernaast (geen echte gegevens). */
function ProductVoorbeeld() {
  return (
    <div className="relative" aria-hidden>
      <div className="rounded-2xl bg-white p-4 text-ink shadow-2xl ring-1 ring-white/10 sm:p-5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[11px] font-semibold text-neutralx-500">Werkgever · Facturen</span>
        </div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutralx-500">Factuur</p>
            <p className="font-display text-[18px] font-bold">2026-0142</p>
          </div>
          <span className="rounded-full bg-ok/10 px-2.5 py-1 text-[11px] font-bold text-ok">E-factuur verstuurd</span>
        </div>
        <table className="mt-4 w-full text-left text-[12px]">
          <thead className="text-neutralx-500">
            <tr>
              <th className="pb-1.5 font-semibold">Omschrijving</th>
              <th className="pb-1.5 text-right font-semibold">Bedrag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            <tr>
              <td className="py-1.5">Gewerkte uren, week 46</td>
              <td className="py-1.5 text-right">€ 1.240,00</td>
            </tr>
            <tr>
              <td className="py-1.5">Platformkosten</td>
              <td className="py-1.5 text-right">€ 140,00</td>
            </tr>
            <tr>
              <td className="py-1.5">Btw 21%</td>
              <td className="py-1.5 text-right">€ 289,80</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-2 flex justify-between border-t border-ink/80 pt-2 text-[13px] font-bold">
          <span>Totaal</span>
          <span>€ 1.669,80</span>
        </div>
        <div className="mt-4 grid gap-1.5 text-[11px]">
          {["UBL-bestand gemaakt (EN 16931)", "Gecontroleerd: geen fouten", "Per mail naar je boekhoudpakket"].map((r) => (
            <span key={r} className="flex items-center gap-1.5 rounded-md bg-paper-soft px-2 py-1.5 font-semibold text-ink">
              <Vink className="!mt-0 text-ok" />
              {r}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-right text-[11px] text-white/50">Voorbeeld</p>
    </div>
  );
}

function FactuurVoorbeeld() {
  return (
    <div className="rounded-2xl border border-hair bg-white p-5 shadow-e2 sm:p-6" aria-hidden>
      <div className="flex items-start justify-between gap-4 text-[12px]">
        <div>
          <p className="font-display text-[16px] font-bold text-ink">ZekerFlex</p>
          <p className="text-neutralx-500">Factuur 2026-0142 · 15 november 2026</p>
        </div>
        <p className="text-right text-neutralx-500">
          Aan: Voorbeeld B.V.
          <br />
          KVK 12345678
        </p>
      </div>
      <table className="mt-5 w-full text-left text-[12px]">
        <thead className="border-b border-hair text-neutralx-500">
          <tr>
            <th className="pb-2 font-semibold">Omschrijving</th>
            <th className="pb-2 text-right font-semibold">Aantal</th>
            <th className="pb-2 text-right font-semibold">Prijs</th>
            <th className="pb-2 text-right font-semibold">Btw</th>
          </tr>
        </thead>
        <tbody className="text-ink">
          <tr>
            <td className="py-1.5">Uren horeca, week 46</td>
            <td className="py-1.5 text-right">40</td>
            <td className="py-1.5 text-right">€ 31,00</td>
            <td className="py-1.5 text-right">21%</td>
          </tr>
          <tr>
            <td className="py-1.5">Platformkosten</td>
            <td className="py-1.5 text-right">40</td>
            <td className="py-1.5 text-right">€ 3,50</td>
            <td className="py-1.5 text-right">21%</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-4 rounded-lg bg-mintwash px-3 py-2.5 text-[12px] text-ink">
        <p className="font-semibold">Ook als e-factuur: factuur-2026-0142.xml</p>
        <p className="mt-0.5 text-neutralx-600">Leverancier, regels, btw en totaal staan erin zoals je pakket ze verwacht.</p>
      </div>
      <p className="mt-3 text-right text-[11px] text-neutralx-500">Voorbeeld</p>
    </div>
  );
}

function StandVoorbeeld() {
  const stappen = [
    { titel: "Gemaakt", sub: "uit de goedgekeurde uren", klaar: true },
    { titel: "Gecontroleerd", sub: "geen fouten gevonden", klaar: true },
    { titel: "Verstuurd", sub: "per mail naar je boekhoudpakket", klaar: true },
    { titel: "Betaald", sub: "nog open", klaar: false },
  ];
  return (
    <div className="rounded-2xl border border-hair bg-white p-5 shadow-e2 sm:p-6" aria-hidden>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-neutralx-500">Factuur 2026-0142</p>
      <ol className="mt-4 space-y-4">
        {stappen.map((s) => (
          <li key={s.titel} className="flex gap-3">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${s.klaar ? "bg-ok text-white" : "border-2 border-hair text-neutralx-400"}`}>{s.klaar ? "✓" : "·"}</span>
            <span>
              <span className={`block text-[15px] font-bold ${s.klaar ? "text-ink" : "text-neutralx-500"}`}>{s.titel}</span>
              <span className="block text-[13px] text-neutralx-600">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-right text-[11px] text-neutralx-500">Voorbeeld</p>
    </div>
  );
}

function TelefoonVoorbeeld() {
  const rijen = [
    ["2026-0142", "€ 1.669,80", "Verstuurd"],
    ["2026-0137", "€ 968,10", "Betaald"],
    ["2026-0131", "€ 2.113,50", "Betaald"],
  ];
  return (
    <div className="mx-auto w-[250px] rounded-[2.2rem] border-[10px] border-ink bg-white p-3 shadow-2xl" aria-hidden>
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-ink/20" />
      <p className="px-1 text-[13px] font-bold text-ink">Facturen</p>
      <ul className="mt-2 space-y-2">
        {rijen.map(([nr, bedrag, stand]) => (
          <li key={nr} className="rounded-xl bg-paper-soft px-3 py-2.5 text-[12px]">
            <span className="flex justify-between font-semibold text-ink">
              <span>{nr}</span>
              <span>{bedrag}</span>
            </span>
            <span className="mt-1 flex items-center justify-between text-neutralx-600">
              <span>E-factuur ✓</span>
              <span className={stand === "Betaald" ? "font-semibold text-ok" : "font-semibold text-plan"}>{stand}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[10px] text-neutralx-500">Voorbeeld</p>
    </div>
  );
}

export function EfactuurPagina({ a, pijlerNaam, pijlerSleutel }: { a: AanbodItem; pijlerNaam: string; pijlerSleutel: string }) {
  return (
    <>
      {/* kop: wat het is, de knoppen en een voorbeeld van het product */}
      <div className="hero-ink text-white">
        <div className="shell grid items-center gap-12 py-16 md:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="eyebrow text-brand-mint">
              <Link href="/aanbod" className="hover:underline">
                Aanbod
              </Link>{" "}
              ·{" "}
              <Link href={`/aanbod#${pijlerSleutel}`} className="hover:underline">
                {pijlerNaam}
              </Link>
            </p>
            <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold md:text-6xl">E-facturen die je boekhouding zelf inleest</h1>
            <p className="mt-6 max-w-2xl text-lg text-white/75">{a.kort}</p>
            <ul className="mt-6 space-y-2 text-[15px] text-white/85">
              {["Elke factuur ook als e-factuur (UBL, Europese norm EN 16931)", "Vanzelf naar het mailadres van je boekhoudpakket", "Inbegrepen bij elk ZekerFlex-account"].map((p) => (
                <li key={p} className="flex gap-2">
                  <Vink className="text-brand-mint" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={a.start.href} className="btn-mint">
                {a.start.label}
              </Link>
              <Link href="/demo" className="btn-ghost-invert">
                Vraag een demo aan
              </Link>
            </div>
          </div>
          <ProductVoorbeeld />
        </div>
      </div>

      {/* in één regel: waarom je het kunt vertrouwen */}
      <section aria-label="In het kort" className="border-b border-hair bg-white">
        <ul className="shell grid gap-x-8 gap-y-3 py-6 text-[14px] font-semibold text-ink sm:grid-cols-2 lg:grid-cols-4">
          {["Inbegrepen, geen abonnement", "Europese norm: EN 16931 · Peppol BIS 3 · NLCIUS", "Gecontroleerd vóór het versturen", "Draait op onze eigen server in Nederland"].map((p) => (
            <li key={p} className="flex gap-2">
              <Vink />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* vier stappen */}
      <section aria-labelledby="ef-stappen" className="bg-paper-soft">
        <div className="shell py-16 md:py-20">
          <h2 id="ef-stappen" className="text-center font-display text-3xl font-bold text-ink md:text-4xl">
            Een e-factuur in vier stappen
          </h2>
          <p className="mt-3 text-center text-[16px] text-neutralx-600">De eerste doe je zelf; de rest doet ZekerFlex.</p>
          <ol className="relative mt-12 grid gap-4 md:grid-cols-4">
            <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-3 hidden h-0.5 bg-brand-500/40 md:block" />
            {EFACTUUR_STAPPEN.map((s, i) => (
              <li key={s.label} className="relative">
                <span className="relative mx-auto grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-[12px] font-bold text-white md:mx-auto">{i + 1}</span>
                <p className="mt-3 text-center text-[12px] font-bold uppercase tracking-[0.12em] text-brand-700">{s.label}</p>
                <div className="mt-4 h-[calc(100%-4.5rem)] rounded-2xl border border-hair bg-white p-5">
                  <p className="font-display text-[17px] font-bold text-ink">{s.titel}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-neutralx-600">{s.tekst}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* geen extra werk */}
      <section aria-labelledby="ef-werk" className="bg-white">
        <div className="shell grid items-center gap-12 py-16 md:py-20 lg:grid-cols-2">
          <div>
            <h2 id="ef-werk" className="font-display text-3xl font-bold text-ink md:text-4xl">
              Een e-factuur kost je <span className="text-brand-600">geen extra werk</span>
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-neutralx-700">
              Je stelt het één keer in: zet onder <strong>Werkgever → Facturen</strong> het mailadres waarop je boekhoudpakket inkoopfacturen ontvangt en vink <strong>automatisch versturen</strong> aan. Daarna gaat elke nieuwe factuur er vanzelf heen, als bestand dat je pakket zelf
              inleest. Leverancier, regels, btw en bedrag staan meteen goed.
            </p>
            <h3 className="mt-8 font-display text-xl font-bold text-ink">Welk boekhoudpakket?</h3>
            <p className="mt-2 text-[16px] leading-relaxed text-neutralx-700">
              Pakketten die e-facturen (UBL) inlezen, zoals Exact Online, Twinfield, e-Boekhouden.nl, Moneybird en AFAS. Gebruik je geen pakket of liever niet per mail? Dan download je het bestand bij elke factuur.
            </p>
          </div>
          <FactuurVoorbeeld />
        </div>
      </section>

      {/* de stand per factuur */}
      <section aria-labelledby="ef-stand" className="bg-paper-soft">
        <div className="shell grid items-center gap-12 py-16 md:py-20 lg:grid-cols-2">
          <div className="lg:order-2">
            <h2 id="ef-stand" className="font-display text-3xl font-bold text-ink md:text-4xl">
              Klaar voor de e-factuur <span className="text-brand-600">als norm</span>
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-neutralx-700">
              De Europese Unie maakt de e-factuur de norm: vanaf 1 juli 2030 wordt hij verplicht voor zakelijke facturen tussen EU-landen. ZekerFlex maakt hem nu al bij elke factuur, dus je hoeft later niets om te zetten.
            </p>
            <p className="mt-4 text-[16px] leading-relaxed text-neutralx-700">
              ZekerFlex legt bij elke factuur vast wat er met de e-factuur gebeurde: gemaakt, gecontroleerd, verstuurd. Lukte versturen niet, dan staat hij voor je klaar om te downloaden.
            </p>
          </div>
          <div className="lg:order-1">
            <StandVoorbeeld />
          </div>
        </div>
      </section>

      {/* wat ZekerFlex met elke factuur doet */}
      <section aria-labelledby="ef-functies" className="bg-white">
        <div className="shell py-16 md:py-20">
          <h2 id="ef-functies" className="text-center font-display text-3xl font-bold text-ink md:text-4xl">
            Wat ZekerFlex doet met <span className="text-brand-600">elke factuur</span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-[16px] text-neutralx-600">Van het bestand tot je boekhouding: het gaat vanzelf, en je ziet precies wat er gebeurde.</p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EFACTUUR_FUNCTIES.map((f) => (
              <li key={f.titel} className="rounded-2xl border border-hair bg-white p-6">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand-700">{f.label}</p>
                <p className="mt-2 font-display text-[18px] font-bold text-ink">
                  {f.titel}
                  {f.binnenkort && <span className="ml-2 inline-block rounded-full bg-plan-soft px-2 py-0.5 align-middle text-[11px] font-semibold text-plan-ink">Komt eraan</span>}
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-neutralx-600">{f.tekst}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* op je telefoon */}
      <section aria-labelledby="ef-telefoon" className="bg-paper-soft">
        <div className="shell grid items-center gap-12 py-16 md:py-20 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 id="ef-telefoon" className="font-display text-3xl font-bold text-ink md:text-4xl">
              Ook op je <span className="text-brand-600">telefoon</span>
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-neutralx-700">
              Je facturen en hun e-factuur staan in je werkgeversomgeving: op de computer en op je telefoon, in de browser of in de app. Je ziet wat er verstuurd is en wat er nog openstaat.
            </p>
            <Link href="/app" className="mt-6 inline-block font-semibold text-brand-600 hover:underline">
              Download de app →
            </Link>
          </div>
          <TelefoonVoorbeeld />
        </div>
      </section>

      {/* prijs en wat erin zit */}
      <section aria-labelledby="ef-prijs" className="bg-white">
        <div className="shell py-16 md:py-20">
          <h2 id="ef-prijs" className="text-center font-display text-3xl font-bold text-ink md:text-4xl">
            Wat kost <span className="text-brand-600">e-facturatie</span>?
          </h2>
          <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-2xl border-2 border-brand-500 bg-white p-6">
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand-700">Elk ZekerFlex-account</p>
              <p className="mt-3 font-display text-5xl font-bold text-ink">€ 0</p>
              <p className="mt-1 text-[14px] text-neutralx-600">extra, zonder abonnement</p>
              <p className="mt-4 text-[14px] leading-relaxed text-neutralx-700">E-facturatie is inbegrepen. Wat je verder betaalt, hangt af van wat je gebruikt, zoals personeel of een branchepakket.</p>
              <div className="mt-6 flex flex-col gap-2">
                <Link href={a.start.href} className="btn-primary text-center text-sm">
                  {a.start.label}
                </Link>
                <Link href="/prijzen" className="text-center text-[14px] font-semibold text-brand-600 hover:underline">
                  Alle prijzen
                </Link>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-hair">
              <table className="w-full text-left text-[14px]">
                <caption className="sr-only">Wat er in e-facturatie zit</caption>
                <thead className="bg-paper-soft text-[13px] text-neutralx-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Wat erin zit
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Inbegrepen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hair">
                  {EFACTUUR_ZIT_ERIN.map((r) => (
                    <tr key={r.wat}>
                      <th scope="row" className="px-4 py-3 font-normal text-ink">
                        {r.wat}
                      </th>
                      <td className="px-4 py-3 text-right font-semibold">{r.binnenkort ? <span className="text-plan-ink">Komt eraan</span> : <span className="text-ok">✓ Ja</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* veelgestelde vragen */}
      <section aria-labelledby="ef-vragen" className="bg-paper-soft">
        <div className="shell grid gap-10 py-16 md:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 id="ef-vragen" className="font-display text-3xl font-bold text-ink md:text-4xl">
              Veelgestelde vragen over <span className="text-brand-600">e-facturen</span>
            </h2>
            <p className="mt-4 text-[16px] text-neutralx-600">Kort antwoord op wat ondernemers ons het vaakst vragen.</p>
          </div>
          <div className="space-y-3">
            {EFACTUUR_FAQ.map((v) => (
              <details key={v.vraag} className="group rounded-2xl border border-hair bg-white px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {v.vraag}
                  <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-neutralx-700">{v.antwoord}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* oproep */}
      <section aria-labelledby="ef-begin" className="bg-white">
        <div className="shell py-16 text-center md:py-20">
          <h2 id="ef-begin" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Je eerste e-factuur, <span className="text-brand-600">vandaag nog</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[16px] text-neutralx-600">Maak een gratis account, keur je eerste uren goed en de e-factuur staat klaar.</p>
          <Link href={a.start.href} className="btn-primary mt-8 inline-block">
            {a.start.label}
          </Link>
        </div>
      </section>
    </>
  );
}
