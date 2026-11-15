// ---------------------------------------------------------------------------
// De luisterdemo van de telefoonassistent op /aanbod/telefonie (16 nov 2026, eigenaar: "maak een voorbeeld audio hoe
// het klinkt en laat ze eerst hun website of bedrijf invullen om de ai te horen met een test klant"). Een kort gesprek
// tussen de assistent van een zaak en een testklant, voorgelezen door onze eigen stemmen (Piper).
//
// Puur bestand (ook voor de browser): het vaste voorbeeld, het reservegesprek, het lezen van wat de bezoeker invulde
// en het soepel lezen van het antwoord van het taalmodel. De server staat in lib/telephony/demo-server.ts.
// ---------------------------------------------------------------------------

export type Spreker = "assistent" | "klant";

export interface DemoRegel {
  wie: Spreker;
  tekst: string;
}

/** Wat de assistent over de zaak weet: van de website, of alleen de naam. */
export interface ZaakInfo {
  naam: string;
  omschrijving?: string;
  /** al uitgeschreven om voor te lezen: "maandag tot en met vrijdag van 9 tot 17 uur" */
  openingstijden?: string[];
}

/** Eén regel zoals de browser hem krijgt: de tekst en het geluid (mp3 of wav, base64), of null als de stem er niet was. */
export interface DemoRegelMetGeluid extends DemoRegel {
  geluid: { mime: string; data: string } | null;
}

export interface DemoGesprek {
  zaak: string;
  /** "ai": door het taalmodel geschreven; "vast": het reservegesprek of het voorbeeld */
  door: "ai" | "vast";
  regels: DemoRegelMetGeluid[];
}

export const MAX_REGELS = 10;
export const MAX_TEKENS_REGEL = 240;
export const MAX_INVOER = 200;

/** Wat de bezoeker invulde: een webadres (met of zonder https://) of gewoon de naam van de zaak. */
export function leesInvoer(raw: string): { soort: "website"; url: string } | { soort: "naam"; naam: string } | null {
  const t = raw.trim().replace(/\s+/g, " ").slice(0, MAX_INVOER);
  if (t.length < 2) return null;
  const zonderSchema = t.replace(/^https?:\/\//i, "");
  if (!/\s/.test(zonderSchema) && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(zonderSchema)) {
    return { soort: "website", url: /^https?:\/\//i.test(t) ? t : `https://${t}` };
  }
  return { soort: "naam", naam: t.slice(0, 80) };
}

const kaal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * De naam van de zaak uit de site: og:site_name, anders het deel van de titel dat op het domein lijkt ("Home | Bakkerij
 * Jansen" op bakkerijjansen.nl → "Bakkerij Jansen"), anders het eerste deel, anders het domein zelf.
 */
export function naamVanSite(titel: string | null, siteNaam: string | null, host: string): string {
  const schoon = (s: string) => s.replace(/\s+/g, " ").trim();
  if (siteNaam && schoon(siteNaam).length >= 2 && schoon(siteNaam).length <= 60) return schoon(siteNaam);
  const domein = host.replace(/^www\./i, "").split(".")[0] ?? host;
  if (titel) {
    const delen = titel
      .split(/\s+[|–—·-]\s+|\s*\|\s*|:\s+/)
      .map(schoon)
      .filter((d) => d.length >= 2 && !/^(home|homepage|welkom|start|startpagina|index)$/i.test(d));
    const opDomein = delen.find((d) => kaal(d).length >= 3 && (kaal(domein).includes(kaal(d)) || kaal(d).includes(kaal(domein))));
    const keuze = opDomein ?? delen.find((d) => d.length <= 40) ?? delen[0];
    if (keuze) return keuze.slice(0, 60);
  }
  return domein.charAt(0).toUpperCase() + domein.slice(1);
}

/** "Maandag t/m vrijdag" en "09:00 – 17:30" → "maandag tot en met vrijdag van 9 tot 17 uur 30", om voor te lezen. */
export function uurVoorlezen(dag: string, tijd: string): string {
  const d = dag.replace(/t\/m/gi, "tot en met").toLowerCase();
  if (/gesloten/i.test(tijd)) return `${d} gesloten`;
  if (/afspraak/i.test(tijd)) return `${d} op afspraak`;
  const stuk = (u: string, m: string) => (m === "00" ? `${Number(u)}` : `${Number(u)} uur ${m}`);
  const reeksen = [...tijd.matchAll(/(\d{1,2}):(\d{2})\s*–\s*(\d{1,2}):(\d{2})/g)].map((m) => {
    const eind = m[4] === "00" ? `${Number(m[3])} uur` : stuk(m[3] ?? "0", m[4] ?? "00");
    return `van ${stuk(m[1] ?? "0", m[2] ?? "00")} tot ${eind}`;
  });
  return reeksen.length ? `${d} ${reeksen.join(" en ")}` : d;
}

/** Tekens die een stem raar voorleest (t/m, &, markdown) netjes maken. */
export function voorStem(tekst: string): string {
  return tekst
    .replace(/t\/m/gi, "tot en met")
    .replace(/\s&\s/g, " en ")
    .replace(/[*_#`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Het reservegesprek als het taalmodel niet op tijd of niet bruikbaar antwoordt: alleen met wat we zeker weten. */
export function reserveGesprek(z: ZaakInfo): DemoRegel[] {
  const uren = z.openingstijden?.slice(0, 2).join(", en ");
  return [
    { wie: "assistent", tekst: `Goedendag, u spreekt met de digitale assistent van ${z.naam}. Waarmee kan ik u helpen?` },
    { wie: "klant", tekst: "Hallo, ik wilde graag weten wanneer jullie open zijn." },
    uren
      ? { wie: "assistent", tekst: `Wij zijn open ${uren}. Kan ik verder nog iets voor u doen?` }
      : { wie: "assistent", tekst: "Dat weet ik niet helemaal zeker, en ik wil u niets verkeerds vertellen. Zal ik een terugbelverzoek voor u klaarzetten?" },
    uren ? { wie: "klant", tekst: "Ja, ik wil ook graag even iemand spreken over een afspraak." } : { wie: "klant", tekst: "Ja, graag." },
    { wie: "assistent", tekst: "Dan zet ik een terugbelverzoek voor u klaar. Een collega belt u zo snel mogelijk terug. Mag ik uw naam?" },
    { wie: "klant", tekst: "Ik ben Sanne de Vries." },
    { wie: "assistent", tekst: "Dank u wel, Sanne. Het terugbelverzoek staat klaar, met het nummer waarmee u nu belt. Fijne dag nog!" },
  ];
}

/** Het vaste voorbeeld (een verzonnen kapsalon), om meteen te luisteren zonder iets in te vullen. */
export const VOORBEELD_ZAAK = "Kapsalon Knipwerk";
export const VOORBEELD: DemoRegel[] = [
  { wie: "assistent", tekst: "Goedemiddag, u spreekt met de digitale assistent van Kapsalon Knipwerk. Mijn collega's zijn aan het knippen, maar ik help u graag. Waarmee kan ik u helpen?" },
  { wie: "klant", tekst: "Hoi, ik wil graag een afspraak maken om mijn haar te laten knippen. Kan dat morgen?" },
  { wie: "assistent", tekst: "De agenda kan ik niet zelf invullen, maar ik zet een terugbelverzoek voor u klaar. Dan belt een collega u zo snel mogelijk om een tijd af te spreken. Mag ik uw naam?" },
  { wie: "klant", tekst: "Ja hoor, ik ben Sanne de Vries. Zijn jullie op zaterdag ook open?" },
  { wie: "assistent", tekst: "Dank u wel, Sanne. Ja, op zaterdag zijn we open van 9 tot 16 uur." },
  { wie: "klant", tekst: "Top, dank je wel!" },
  { wie: "assistent", tekst: "Graag gedaan. Het terugbelverzoek staat klaar, met het nummer waarmee u nu belt. Fijne dag nog!" },
];

const ASSISTENT = /assist|zaak|bedrijf|medewerker|receptie|^ai$|bot/i;
const KLANT = /klant|beller|caller|sanne|gast|test/i;

function wieVan(x: unknown): Spreker | null {
  if (typeof x !== "string") return null;
  if (ASSISTENT.test(x)) return "assistent";
  if (KLANT.test(x)) return "klant";
  return null;
}

/** Tekst van een model is soms een object of getal: maak er tekst van, of niets. */
function tekstVan(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    for (const k of ["tekst", "text", "zin", "inhoud"]) if (typeof o[k] === "string") return o[k] as string;
  }
  return "";
}

/** Op een grens van een zin inkorten, zodat een stem niet midden in een woord stopt. */
function inkorten(t: string): string {
  if (t.length <= MAX_TEKENS_REGEL) return t;
  const stuk = t.slice(0, MAX_TEKENS_REGEL);
  const eind = Math.max(stuk.lastIndexOf(". "), stuk.lastIndexOf("? "), stuk.lastIndexOf("! "));
  return eind > 40 ? stuk.slice(0, eind + 1) : `${stuk.replace(/\s+\S*$/, "")}.`;
}

/**
 * Het antwoord van het taalmodel, soepel gelezen (lib/orchestration/antwoord.ts-aanpak): { regels: [...] }, een losse
 * lijst of { gesprek: [...] }; "wie" mag ook "spreker" of "rol" heten. Een regel met een telefoonnummer, mailadres of
 * link valt weg (die mag het model niet verzinnen). Bruikbaar = minstens 4 regels, beide sprekers, de assistent begint.
 * Anders null: dan het reservegesprek.
 */
export function leesGesprek(raw: unknown): DemoRegel[] | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const lijst = Array.isArray(raw) ? raw : Array.isArray(o?.regels) ? o.regels : Array.isArray(o?.gesprek) ? o.gesprek : null;
  if (!lijst) return null;
  const uit: DemoRegel[] = [];
  for (const item of lijst) {
    if (uit.length >= MAX_REGELS) break;
    const r = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const wie = wieVan(r?.wie ?? r?.spreker ?? r?.rol ?? r?.role);
    const tekst = voorStem(tekstVan(r?.tekst ?? r?.text ?? r?.zin)).replace(/^["'“„]+|["'”]+$/g, "");
    if (!wie || tekst.length < 2) continue;
    if (/\d[\d\s-]{5,}\d|@|https?:|www\./i.test(tekst)) continue;
    uit.push({ wie, tekst: inkorten(tekst) });
  }
  if (uit.length < 4 || uit[0]?.wie !== "assistent" || !uit.some((r) => r.wie === "klant")) return null;
  return uit;
}
