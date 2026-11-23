// ---------------------------------------------------------------------------
// De gedeelde bouwstenen van de werkgeversapp (eigenaar, 23 nov 2026: dezelfde rust en indeling als het dashboard van
// YoungOnes, in de huisstijl van ZekerFlex). Dit bestand is puur (geen React, geen servercode): de klassen en de kleine
// rekenregels die Kaart, LijstTabel, FormulierRij, Dialoog, Schakelaar en PaginaKop delen, zodat een server- én een
// clientbestand ze kan gebruiken en een test ze zonder scherm kan nalopen (tests/werkgever-bouwstenen.test.ts).
// Alleen eigen kleuren (ink, paper, hair, brand, neutralx): die hebben allemaal een donkere regel in app/globals.css.
// ---------------------------------------------------------------------------

/** Klassen samenvoegen; lege delen vallen weg. */
export function kl(...delen: (string | false | null | undefined)[]): string {
  return delen.filter(Boolean).join(" ");
}

/** Een kaart: wit, afgeronde hoeken, dunne rand, bijna geen schaduw. */
export const KAART = "rounded-xl border border-hair bg-white shadow-e1";
/** De ruimte binnen een kaart. */
export const KAART_VULLING = "p-5";
/** De kop van een blok binnen een kaart of formulier. */
export const BLOK_KOP = "font-display text-lg font-bold leading-snug text-ink";
/** De uitleg onder zo'n kop. */
export const BLOK_UITLEG = "mt-1 text-sm leading-relaxed text-neutralx-600";

// --- de schil (components/app/EmployerShell.tsx), op de maten die naast de referentie zijn gemeten (ronde 2, 23 nov 2026) ---
/** De zijbalk is op een laptop 94 px breed als hij is ingeklapt en 221 px als hij is uitgeklapt; de inhoud krijgt de rest. */
export const SCHIL_RASTER_IN = "lg:grid-cols-[94px_minmax(0,1fr)]";
export const SCHIL_RASTER_UIT = "lg:grid-cols-[221px_minmax(0,1fr)]";
export const SCHIL_ZIJBALK_IN = "lg:w-[94px]";
export const SCHIL_ZIJBALK_UIT = "lg:w-[221px]";
/** De kopbalk: 78 px hoog op een laptop, 64 px op een telefoon. */
export const SCHIL_KOPBALK = "h-16 lg:h-[78px]";
/** De inhoud: links uitgelijnd (geen `mx-auto`), hooguit 1192 px breed. */
export const SCHIL_INHOUD = "max-w-[1192px]";

/**
 * De paginatitel: hoofdletters, één per pagina, in de donkere merkkleur. 22 px op een telefoon (een lang woord past op 390 px),
 * 32 px op een laptop. `wg-titel`: in het donkere thema wit in plaats van mint (app/globals.css).
 */
export const KOP_TITEL = "wg-titel break-words font-display text-[1.375rem] font-extrabold uppercase leading-tight tracking-tight text-brand-700 sm:text-[1.625rem] lg:text-[2rem]";
/** De link onder de titel ("Terug naar instellingen"): minstens 44 px hoog om te tikken. */
export const KOP_TERUG = "mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline";

/** De kopregel van een lijst. */
export const TABEL_KOP = "relative px-6 py-3 text-xs font-semibold text-neutralx-500";
/** Eén cel; op een telefoon staan de cellen van een rij onder elkaar. */
export const TABEL_CEL = "block break-words sm:table-cell sm:px-6 sm:py-4";

/** Twee kolommen op een laptop (links kop en uitleg, rechts de velden), onder elkaar op een telefoon. */
export const FORMULIER_RIJ = "grid gap-5 border-t border-hair py-8 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12";

/**
 * De knoppenrij onder een dialoog. In de code staat Annuleren eerst en de hoofdknop als laatste; op een telefoon staan ze onder
 * elkaar met de hoofdknop bovenaan, op een laptop links naast elkaar met de hoofdknop vóór Annuleren (rij omgekeerd, dus
 * `justify-end` is hier de linkerkant).
 */
export const DIALOOG_ACTIES = "flex flex-col-reverse gap-2 px-6 pb-6 pt-5 sm:flex-row-reverse sm:justify-end sm:px-8";
/** De breedte van het paneel van een dialoog op een laptop. */
export const DIALOOG_BREEDTE = "max-w-[640px]";

/** De baan en de knop van een schakelaar. Groen = aan (doen), grijs = uit. */
export function schakelaarKlassen(aan: boolean): { baan: string; knop: string } {
  return {
    baan: kl("relative h-6 w-11 flex-shrink-0 rounded-full transition-colors", aan ? "bg-brand-500" : "bg-neutralx-300"),
    knop: kl("absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white transition-transform", aan ? "translate-x-[22px]" : "translate-x-0.5"),
  };
}

/** Het aantal kolommen van de kopregel: de gewone kolommen plus één voor de acties, als een rij die heeft. */
export function aantalKolommen(kolommen: number, heeftActie: boolean): number {
  return Math.max(0, Math.floor(kolommen)) + (heeftActie ? 1 : 0);
}

/** Waar staat een stap in een rij stappen: al gedaan, nu aan de beurt, of nog niet. */
export type StapStand = "klaar" | "actief" | "open";

/**
 * De voortgang van een blok stappen zoals de kop hem toont: "Stap 2 van 4" en "25% voltooid". De stap is de eerste die nog
 * open staat (of de laatste als alles klaar is); het percentage is wat er klaar is.
 */
export function blokVoortgang(klaar: boolean[]): { stap: number; totaal: number; pct: number } {
  const totaal = klaar.length;
  const gedaan = klaar.filter(Boolean).length;
  const eersteOpen = klaar.indexOf(false);
  return {
    stap: totaal === 0 ? 0 : eersteOpen === -1 ? totaal : eersteOpen + 1,
    totaal,
    pct: totaal === 0 ? 100 : Math.round((gedaan / totaal) * 100),
  };
}

/** De stand van elke stap: klaar, de eerste open stap is actief, de rest is open. */
export function stapStanden(klaar: boolean[]): StapStand[] {
  const eersteOpen = klaar.indexOf(false);
  return klaar.map((k, i) => (k ? "klaar" : i === eersteOpen ? "actief" : "open"));
}
