import { Fragment, createElement, type ReactNode } from "react";
import { vulIn } from "@/lib/i18n/vul-in";

// ---------------------------------------------------------------------------
// De openbare site in elke taal (28 nov 2026, eigenaar: "elke taal mogelijk in heel ZekerFlex").
//
// De Nederlandse zin is zelf de sleutel. In een pagina staat `tx("Vind flexwerk bij jou in de buurt")`: de code blijft
// leesbaar Nederlands en er is geen apart woordenboek met verzonnen sleutels. Een zin in een lijst of tabel buiten de
// component markeer je met `vt("…")` (geeft hem ongewijzigd terug), en bij het tonen gaat hij door `tx(…)`.
// scripts/site-teksten.mjs haalt elke tx("…") en vt("…") uit de code; de talen-motor vertaalt ze, met dezelfde blinde
// steekproef als de werkersapp, naar lib/i18n/gen/site.<taal>.ts. Wat er (nog) niet in staat, blijft Nederlands.
//
// Alleen serveronderdelen vertalen (await getSiteT() in lib/i18n/server.ts): zo verstuurt de server de pagina al in de
// goede taal, zonder flits en zonder botsing met React. Een clientonderdeel krijgt zijn teksten al vertaald mee als prop.
// Google stuurt geen taalcookie en ziet dus altijd het Nederlands: de vindbaarheid verandert niet.
//
// Puur bestand (geen woordenboeken, geen netwerk): ook client-bestanden mogen `vt` en de typen importeren.
// ---------------------------------------------------------------------------

export type SiteVertaling = Readonly<Record<string, string>>;
export type SiteT = (nl: string, waarden?: Readonly<Record<string, string | number>>) => string;

/** De sleutel van een zin: witruimte samengevoegd, zodat een regeleinde in de JSX geen andere sleutel oplevert. */
export function siteSleutel(nl: string): string {
  return nl.replace(/\s+/gu, " ").trim();
}

/** Markeert een zin in een lijst of tabel, zodat scripts/site-teksten.mjs hem vindt. Geeft hem ongewijzigd terug. */
export function vt<T extends string>(nl: T): T {
  return nl;
}

/** De vertaalfunctie voor één taal. Zonder vertaling (Nederlands, of een zin die nog niet vertaald is) blijft de zin staan. */
export function maakSiteT(vertaling: SiteVertaling | undefined): SiteT {
  return (nl, waarden) => {
    const gevonden = vertaling ? vertaling[siteSleutel(nl)] : undefined;
    // de spaties rond de zin horen bij de opmaak ("Nog " vóór een getal): die blijven, ook in de vertaling
    const tekst = gevonden === undefined ? nl : `${/^\s*/u.exec(nl)?.[0] ?? ""}${gevonden}${/\s*$/u.exec(nl)?.[0] ?? ""}`;
    return waarden ? vulIn(tekst, { ...waarden }) : tekst;
  };
}

/** De Nederlandse "vertaling": doet niets. Voor onderdelen die zonder taal worden getoond (tests, voorbeelden). */
export const NL_SITE_T: SiteT = maakSiteT(undefined);

/** De namen van velden die in menu's en knoppen tekst bevatten (zelfde idee als scripts/site-markeren.mjs). */
export const TEKSTVELDEN: ReadonlySet<string> = new Set(["label", "title", "titel", "desc", "naam", "sub", "tekst", "kop", "omschrijving"]);

/** Alle teksten in een stuk data (menu, knoppen, tegels): de waarden van tekstvelden, ook diep genest. */
export function verzamelTeksten(data: unknown, velden: ReadonlySet<string> = TEKSTVELDEN, uit: Set<string> = new Set()): Set<string> {
  if (Array.isArray(data)) {
    for (const d of data) verzamelTeksten(d, velden, uit);
  } else if (data !== null && typeof data === "object") {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === "string") {
        if (velden.has(k) && /\p{L}/u.test(v)) uit.add(v);
      } else verzamelTeksten(v, velden, uit);
    }
  }
  return uit;
}

/**
 * Een klein woordenboek voor een clientonderdeel (de kop, het menu): alleen deze zinnen, en alleen als ze vertaald zijn.
 * Een clientonderdeel krijgt nooit een functie van de server; dit is gewone data, die het met maakSiteT() weer opzoekt.
 */
export function deelVertaling(tx: SiteT, zinnen: Iterable<string>): SiteVertaling {
  const uit: Record<string, string> = {};
  for (const z of zinnen) {
    const sleutel = siteSleutel(z);
    const vertaald = tx(sleutel);
    if (vertaald !== sleutel) uit[sleutel] = vertaald;
  }
  return uit;
}

/**
 * Een vertaalde zin met een link of vet woord erin: "Vragen? Mail {mail} of kijk bij {contact}." met als `delen` de echte
 * elementen. De hele zin wordt vertaald (dan klopt de woordvolgorde in elke taal); daarna komen de elementen op hun plek.
 * Een plaatshouder zonder deel blijft gewoon staan.
 */
export function vulInMet(tekst: string, delen: Readonly<Record<string, ReactNode>>): ReactNode[] {
  const uit: ReactNode[] = [];
  let laatst = 0;
  for (const m of tekst.matchAll(/\{(\w+)\}/gu)) {
    const sleutel = m[1] ?? "";
    const plek = m.index ?? 0;
    if (!Object.hasOwn(delen, sleutel)) continue;
    if (plek > laatst) uit.push(tekst.slice(laatst, plek));
    uit.push(createElement(Fragment, { key: `${sleutel}-${plek}` }, delen[sleutel]));
    laatst = plek + m[0].length;
  }
  if (laatst < tekst.length) uit.push(tekst.slice(laatst));
  return uit;
}
