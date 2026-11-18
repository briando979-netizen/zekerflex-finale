import { BASE_FEE_PER_HOUR_CENTS, VOLUME_TIERS, tierRateCents } from "@/lib/pricing/tiers";

// ---------------------------------------------------------------------------
// De vaste tekst van een campagne (18 nov 2026): één aanbodmail die de eigenaar zelf schrijft, in plaats van een mail die
// het model per bedrijf bedenkt. De tekst kent drie plaatshouders ({bedrijf}, {aanhef}, {plaats}) en wordt bij het
// bewaren gecontroleerd: lengte, geen vreemde plaatshouder, geen woorden die iets beloven wat nu niet kan (bank,
// voorschot, verzekering, garantie) en geen ander bedrag dan de platformkosten uit lib/pricing/tiers.ts.
// Puur (geen prisma, kv, mail of zod): het formulier in de browser, de routes, de motor en de tests delen dit bestand.
// De opslag staat in lib/sales/campagne-tekst-opslag.ts.
// ---------------------------------------------------------------------------

export interface CampagneTekst {
  onderwerp: string;
  tekst: string;
  knopTekst?: string;
  knopUrl?: string;
  /** ook bedrijven benaderen waar geen vacature van bekend is (de motor eist anders een vacaturesignaal) */
  zonderVacature: boolean;
  /** ISO-tijdstip van het bewaren */
  bijgewerkt: string;
  /** wie hem bewaarde (mailadres van de beheerder) */
  door: string;
}

/** Wat het formulier invult; het tijdstip en de naam zet de server erbij. */
export type CampagneTekstInvoer = Pick<CampagneTekst, "onderwerp" | "tekst" | "knopTekst" | "knopUrl" | "zonderVacature">;

export interface Invulling {
  bedrijf: string;
  aanhef: string;
  plaats: string;
}

/** Het generatedByModel van een concept dat uit de vaste tekst komt (geen model). */
export const CAMPAGNE_TEKST_MODEL = "campagne-tekst";

/** De waarden van de voorbeeldmail en van de controle bij het bewaren. */
export const PROEF_INVULLING: Invulling = { bedrijf: "Voorbeeld B.V.", aanhef: "heer/mevrouw", plaats: "Rotterdam" };

/** Voor een bedrijf zonder bekende plaats: "bedrijven in je regio" leest nog goed. */
export const PLAATS_ONBEKEND = "je regio";

export const ONDERWERP_MIN = 5;
export const ONDERWERP_MAX = 90;
export const TEKST_MIN = 200;
export const TEKST_MAX = 2500;
export const KNOPTEKST_MAX = 60;
const EIGEN_SITE = "https://zekerflex.com/";

/** Vult {bedrijf}, {aanhef} en {plaats} in, in één keer (een bedrijfsnaam met accolades wordt niet opnieuw ingevuld). */
export function vulIn(sjabloon: string, waarden: Invulling): string {
  return sjabloon.replace(/\{(bedrijf|aanhef|plaats)\}/g, (_heel, naam: string) =>
    naam === "bedrijf" ? waarden.bedrijf : naam === "aanhef" ? waarden.aanhef : waarden.plaats,
  );
}

/** Wat er na het invullen nog tussen accolades staat: een onbekende plaatshouder ({naam}, {stad}) of een tikfout. */
export function overgeblevenPlaatshouders(ingevuld: string): string[] {
  return [...new Set(ingevuld.match(/\{[^{}\n]{0,40}\}/g) ?? [])];
}

/** "Beste {aanhef}": de naam van de contactpersoon, of "heer/mevrouw" als we die niet kennen. */
export function aanhefVoor(contactName: string | null | undefined): string {
  const naam = (contactName ?? "").replace(/\s+/g, " ").trim();
  return naam || "heer/mevrouw";
}

/** De invulling voor één bedrijf. */
export function invullingVoor(lead: { companyName: string; contactName: string | null; city: string | null }): Invulling {
  return { bedrijf: lead.companyName.trim(), aanhef: aanhefVoor(lead.contactName), plaats: (lead.city ?? "").trim() || PLAATS_ONBEKEND };
}

/** Woorden die iets beloven wat ZekerFlex nu niet doet (AGENTS.md: bank uit, geen verzekeraar, geen online betalen). */
const VERBODEN: readonly { patroon: RegExp; woord: string; waarom: string }[] = [
  { patroon: /betaalpas/i, woord: "betaalpas", waarom: "ZekerFlex geeft geen passen uit" },
  { patroon: /bankpas/i, woord: "bankpas", waarom: "ZekerFlex geeft geen passen uit" },
  { patroon: /zekerflex\s+bank/i, woord: "ZekerFlex Bank", waarom: "de bank staat uit" },
  { patroon: /voorschot/i, woord: "voorschot", waarom: "een voorschot kan nu niet" },
  { patroon: /verzekerd/i, woord: "verzekerd", waarom: "er is geen verzekeraar" },
  { patroon: /verzekering/i, woord: "verzekering", waarom: "er is geen verzekeraar" },
  { patroon: /garantie/i, woord: "garantie", waarom: "we garanderen niets wat we niet kunnen waarmaken" },
  { patroon: /gegarandeerd/i, woord: "gegarandeerd", waarom: "we garanderen niets wat we niet kunnen waarmaken" },
  { patroon: /marktleider/i, woord: "marktleider", waarom: "dat is niet waar" },
  { patroon: /goedkoopste/i, woord: "goedkoopste", waarom: "dat kunnen we niet bewijzen" },
  { patroon: /direct\s+uitbetaald/i, woord: "direct uitbetaald", waarom: "snelle uitbetaling staat uit" },
  // als los woord: "ideale" en "idealiter" mogen
  { patroon: /(^|[^a-z])ideal([^a-z]|$)/i, woord: "iDEAL", waarom: "online betalen staat nog niet open" },
  { patroon: /betaallink/i, woord: "betaallink", waarom: "online betalen staat nog niet open" },
];

const alsBedrag = (centen: number): string => (centen / 100).toFixed(2).replace(".", ",");

/** De enige bedragen die in een aanbodmail mogen staan: de platformkosten per uur en de eerste staffel (lib/pricing/tiers.ts). */
export function toegestaneBedragen(): string[] {
  const staffel = VOLUME_TIERS[1];
  return [alsBedrag(BASE_FEE_PER_HOUR_CENTS), ...(staffel ? [alsBedrag(tierRateCents(staffel))] : [])];
}

/** Elk bedrag in de tekst ("€ 3,50", "€25", "50 euro"), als "3,50". */
export function bedragenIn(tekst: string): string[] {
  const uit: string[] = [];
  for (const m of tekst.matchAll(/(?:€|\beur\b)\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*euro\b/gi)) {
    const getal = Number((m[1] ?? m[2] ?? "").replace(",", "."));
    if (Number.isFinite(getal)) uit.push(getal.toFixed(2).replace(".", ","));
  }
  return uit;
}

/** Mag de knop hierheen: een pad op onze eigen site ("/register") of een volledig adres op zekerflex.com. */
export function knopUrlGeldig(url: string): boolean {
  if (/[\s"'<>\\]/.test(url)) return false;
  if (url.startsWith("/")) return !url.startsWith("//");
  return url.startsWith(EIGEN_SITE);
}

/** De knop onder de mail, met een volledig adres; null als de campagne geen (geldige) eigen knop heeft. */
export function knopVan(t: Pick<CampagneTekst, "knopTekst" | "knopUrl"> | null | undefined, basisUrl: string): { url: string; tekst: string } | null {
  const tekst = (t?.knopTekst ?? "").trim();
  const url = (t?.knopUrl ?? "").trim();
  if (!tekst || !url || !knopUrlGeldig(url)) return null;
  return { url: url.startsWith("/") ? `${basisUrl.replace(/\/+$/, "")}${url}` : url, tekst };
}

/** De mail voor één bedrijf: onderwerp en tekst met de plaatshouders ingevuld. */
export function maakCampagneMail(t: Pick<CampagneTekst, "onderwerp" | "tekst">, waarden: Invulling): { subject: string; body: string } {
  return { subject: vulIn(t.onderwerp, waarden).trim().slice(0, 200), body: vulIn(t.tekst, waarden).trim().slice(0, 4000) };
}

export interface Beoordeling {
  goed: boolean;
  redenen: string[];
}

/** Mag deze tekst als vaste campagnemail bewaard worden? Elke reden is een zin voor de eigenaar. */
export function beoordeelCampagneTekst(t: Partial<CampagneTekstInvoer>): Beoordeling {
  const redenen: string[] = [];
  const onderwerp = (t.onderwerp ?? "").trim();
  const tekst = (t.tekst ?? "").trim();
  const knopTekst = (t.knopTekst ?? "").trim();
  const knopUrl = (t.knopUrl ?? "").trim();

  if (onderwerp.length < ONDERWERP_MIN || onderwerp.length > ONDERWERP_MAX) {
    redenen.push(`Het onderwerp moet ${ONDERWERP_MIN} tot ${ONDERWERP_MAX} tekens zijn (nu ${onderwerp.length}).`);
  }
  if (/[\r\n]/.test(onderwerp)) redenen.push("Het onderwerp is één regel.");
  if (tekst.length < TEKST_MIN || tekst.length > TEKST_MAX) {
    redenen.push(`De tekst moet ${TEKST_MIN} tot ${TEKST_MAX} tekens zijn (nu ${tekst.length}).`);
  }
  if (!onderwerp.includes("{bedrijf}") && !tekst.includes("{bedrijf}")) {
    redenen.push("Noem het bedrijf: zet {bedrijf} in het onderwerp of in de tekst.");
  }
  const over = overgeblevenPlaatshouders(`${vulIn(onderwerp, PROEF_INVULLING)}\n${vulIn(tekst, PROEF_INVULLING)}`);
  if (over.length) {
    redenen.push(`Onbekende plaatshouder: ${over.join(", ")}. Alleen {bedrijf}, {aanhef} en {plaats} worden ingevuld.`);
  }

  if (knopTekst.length > KNOPTEKST_MAX) redenen.push(`De knoptekst mag hooguit ${KNOPTEKST_MAX} tekens zijn.`);
  if (knopUrl && !knopUrlGeldig(knopUrl)) {
    redenen.push(`De knop mag alleen naar onze eigen site: een pad dat met / begint of een adres dat met ${EIGEN_SITE} begint.`);
  }
  if (Boolean(knopTekst) !== Boolean(knopUrl)) {
    redenen.push("Een eigen knop heeft een tekst én een adres nodig. Laat beide leeg voor de gewone knop.");
  }

  const alles = `${onderwerp}\n${tekst}\n${knopTekst}`;
  for (const v of VERBODEN) {
    if (v.patroon.test(alles)) redenen.push(`Het woord "${v.woord}" mag er niet in: ${v.waarom}.`);
  }
  const mag = toegestaneBedragen();
  const vreemd = [...new Set(bedragenIn(alles).filter((b) => !mag.includes(b)))];
  if (vreemd.length) {
    redenen.push(`Alleen de platformkosten (${mag.map((b) => `€ ${b}`).join(" en ")}) mogen als bedrag in de mail. Haal weg: ${vreemd.map((b) => `€ ${b}`).join(", ")}.`);
  }

  return { goed: redenen.length === 0, redenen };
}

/** Het Partnerdeal-voorbeeld (18 nov 2026, tekst van de eigenaar): een maand zonder platformkosten in ruil voor een vermelding als partner. */
export const PARTNERDEAL_STANDAARD: CampagneTekstInvoer = {
  onderwerp: "Een maand zonder platformkosten voor {bedrijf}",
  tekst: [
    "Beste {aanhef},",
    "Heb je weleens een gat in je rooster of een drukke week waarin je extra handen nodig hebt? Daar is ZekerFlex voor: een Nederlands platform waar je zelf flexkrachten vindt, zonder tussenpersoon.",
    [
      "Zo werkt het:",
      "1. Je maakt gratis een account aan en zet je klus uit: wat, waar, wanneer en voor welk uurtarief.",
      "2. Werkers bij jou in de buurt reageren op je klus.",
      "3. Jij bekijkt de kandidaten en beslist zelf wie je inroostert.",
      "4. ZekerFlex stelt daarnaast passende kandidaten voor, zodat je niet hoeft te wachten tot iemand reageert.",
      "5. De werker checkt in met de telefoon. Uren en facturen lopen daarna via het platform.",
    ].join("\n"),
    "Er hebben zich bijna 100 werkers aangemeld, van wie 35 met een gecontroleerd identiteitsbewijs. De meesten wonen in Zuid- en Noord-Holland, Noord-Brabant, Utrecht en Groningen.",
    "Ons aanbod voor {bedrijf}: de eerste maand betaal je geen platformkosten. Normaal is dat € 3,50 per gewerkt uur; nu betaal je alleen het uurtarief van de kracht. Geen abonnement, geen opstartkosten. In ruil vermelden wij {bedrijf} op onze site als partner die met ZekerFlex werkt.",
    "Wil je het proberen? Maak je account aan via de knop hieronder, of antwoord op deze mail, dan help ik je met je eerste klus.",
    ["Groet,", "Briando van Essen", "ZekerFlex", "+31 970 102 51797"].join("\n"),
  ].join("\n\n"),
  knopTekst: "Maak gratis een account",
  knopUrl: "/register?type=bedrijf",
  zonderVacature: true,
};
