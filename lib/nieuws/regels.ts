// ---------------------------------------------------------------------------
// De nieuwsroom (18 nov 2026, eigenaar: "een newsroom die helemaal geüpdatet is van het laatste nieuws en de berichten
// automatisch plaatst, in ZekerFlex-stijl"). Dit bestand is puur: de soorten, het lezen van een feed, de keuze welk
// bericht bij ons past, en de harde controle op wat het model schreef. Geen prisma, kv of netwerk.
//
// Uitgangspunten:
// - alleen openbare, officiële bronnen met een feed (lib/nieuws/bronnen.ts); we schrijven een eigen, kort bericht en
//   linken naar de bron. We nemen geen tekst van kranten of andere platforms over.
// - het model mag niets verzinnen: elk getal in ons bericht moet letterlijk in de brontekst staan (`getallenBuitenBron`).
// ---------------------------------------------------------------------------

export const RUBRIEKEN = ["arbeidsmarkt", "regels", "ondernemen", "zekerflex"] as const;
export type Rubriek = (typeof RUBRIEKEN)[number];
export const RUBRIEK_NAAM: Record<Rubriek, string> = {
  arbeidsmarkt: "Arbeidsmarkt",
  regels: "Wet en regels",
  ondernemen: "Ondernemen",
  zekerflex: "Van ZekerFlex",
};
export const isRubriek = (v: string): v is Rubriek => (RUBRIEKEN as readonly string[]).includes(v);

export type NieuwsStatus = "concept" | "geplaatst" | "verborgen";

export interface NieuwsBlok {
  kop?: string;
  alineas: string[];
}

export interface NieuwsBericht {
  slug: string;
  titel: string;
  samenvatting: string;
  blokken: NieuwsBlok[];
  rubriek: Rubriek;
  /** ISO-tijdstip waarop wij het bericht maakten */
  gemaakt: string;
  /** ISO-tijdstip van plaatsen; leeg zolang het een concept is */
  geplaatst?: string;
  status: NieuwsStatus;
  bron: { naam: string; titel: string; url: string; datum: string };
  /** wie plaatste: "vanzelf" of het mailadres van de beheerder */
  door?: string;
}

export interface FeedItem {
  id: string;
  titel: string;
  url: string;
  datum: string;
  omschrijving: string;
}

// --- een RSS-feed lezen ---------------------------------------------------------------------------

const ENTITEITEN: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", eacute: "é", euml: "ë", iuml: "ï", ouml: "ö", egrave: "è", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—" };

export function ontcijfer(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (heel, naam: string) => (Object.hasOwn(ENTITEITEN, naam) ? (ENTITEITEN[naam] ?? heel) : heel));
}

const veld = (blok: string, naam: string): string => {
  const m = new RegExp(`<${naam}(?:\\s[^>]*)?>([\\s\\S]*?)</${naam}>`, "i").exec(blok);
  return m ? ontcijfer(m[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
};

/**
 * De items uit een RSS 2.0-feed. Een item zonder titel, link of geldige datum slaan we over. Met `zonderDatum` mag de
 * datum ontbreken (de feed van de internetconsultaties heeft er geen): `datum` is dan leeg en komt later van de pagina.
 */
export function leesRss(xml: string, zonderDatum = false): FeedItem[] {
  const uit: FeedItem[] = [];
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const blok = m[1] ?? "";
    const titel = veld(blok, "title");
    const url = veld(blok, "link");
    const tijd = Date.parse(veld(blok, "pubDate"));
    if (!titel || !/^https:\/\//.test(url) || (Number.isNaN(tijd) && !zonderDatum)) continue;
    uit.push({ id: veld(blok, "guid") || url, titel, url, datum: Number.isNaN(tijd) ? "" : new Date(tijd).toISOString(), omschrijving: veld(blok, "description") });
  }
  return uit;
}

// --- wetsvoorstellen ter consultatie --------------------------------------------------------------

/** Wetsvoorstellen en besluiten waar onze lezers mee te maken krijgen: werk, inhuren, loon, zzp en ondernemen. */
const WET_PAST =
  /\b(arbeid\w*|werknemer\w*|werkgever\w*|uitzend\w*|terbeschikkingstelling|intermediairs?|detacher\w*|gedetacheerd\w*|zzp|zelfstandige\w*|schijnzelfstandig\w*|minimumloon|loon\b|lonen\b|loonbelasting\w*|loonheffing\w*|cao\b|pensioen\w*|ziektewet|verlof\w*|ontslag\w*|werkloosheid\w*|arbeidsmigrant\w*|omzetbelasting|btw\b|facturatie|factur\w*|ondernemers?\b|handelsregister|kleineondernemers\w*|flex\w*|oproep\w*|platformwerk\w*|arbeidsomstandigheden\w*)/i;

/** Past dit wetsvoorstel bij ons? */
export const wetPast = (titel: string) => WET_PAST.test(titel);

export interface Consultatie {
  /** ISO-tijdstip van de start (12:00 Nederlandse wintertijd: alleen de dag telt) */
  start: string;
  actief: boolean;
}

/**
 * De leesbare tekst van een consultatiepagina: eerst de gegevens (start, einde, status), dan het stuk van "In het kort"
 * tot de lijst met documenten. De pagina heeft geen <main>; zonder dit knippen zou het menu van Overheid.nl meekomen.
 */
export function consultatieTekst(html: string, max = 6000): string {
  const plat = ontcijfer(html.replace(/<(script|style|noscript|svg)[\s>][\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|h[1-6]|li|div|section|tr|td|th|dt|dd|br)>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  const gegeven = (naam: string) => new RegExp(`${naam}\\s*(\\d{2}-\\d{2}-\\d{4}|[A-Za-z]+)`, "i").exec(plat)?.[1] ?? "";
  const kop = [`Startdatum consultatie ${gegeven("Startdatum consultatie")}`, `Einddatum consultatie ${gegeven("Einddatum consultatie")}`, `Status ${gegeven("Status")}`];
  const begin = plat.indexOf("In het kort");
  const na = begin >= 0 ? plat.slice(begin) : plat;
  // de gegevens staan al in de kop; het blok op de pagina zelf en alles vanaf de documenten hoort niet bij de leestekst
  const eind = [na.indexOf("\nRelevante documenten"), na.indexOf("\nPublicatie reacties")].filter((i) => i > 0).sort((a, b) => a - b)[0];
  const lijf = (eind ? na.slice(0, eind) : na).replace(/\nReageren op deze consultatie\b/g, "").replace(/\nConsultatiegegevens\n[\s\S]*?(?=\nVoor wie belangrijk|\nWat verandert er|$)/, "");
  return `${kop.join("\n")}\n${lijf.trim()}`.slice(0, max);
}

/** De startdatum en de status van een consultatiepagina, uit de leesbare tekst. Null als die er niet in staan. */
export function consultatieGegevens(tekst: string): Consultatie | null {
  const m = /Startdatum consultatie\s*(\d{2})-(\d{2})-(\d{4})/i.exec(tekst);
  if (!m) return null;
  const start = `${m[3]}-${m[2]}-${m[1]}T12:00:00+01:00`;
  if (Number.isNaN(Date.parse(start))) return null;
  return { start: new Date(start).toISOString(), actief: /Status\s*Actief/i.test(tekst) };
}

// --- past dit bericht bij ons? --------------------------------------------------------------------

/** Woorden waar onze lezers (flexwerkers, zzp'ers, uitzendkrachten en bedrijven die inhuren) iets aan hebben. */
const PAST: readonly { re: RegExp; rubriek: Rubriek }[] = [
  { re: /\b(zzp|zelfstandige\w*|schijnzelfstandig\w*|minimumloon|minimumuurloon|cao\b|cao-lonen|wet\b|wetsvoorstel|uitzend\w*|flexwerk\w*|flexibele arbeid\w*|flexkracht\w*|arbeidscontract\w*|vast contract|oproep\w*)/i, rubriek: "regels" },
  { re: /\b(werkloos\w*|werkend\w*|banen\b|baan\b|vacature\w*|arbeidsmarkt\w*|personeel\w*|personeelstekort\w*|krapte|lonen\b|loon\b|uurloon\w*|verdien\w*|bijbaan\w*|studenten|jongeren werk\w*|arbeidsmigrant\w*|werknemers)/i, rubriek: "arbeidsmarkt" },
  { re: /\b(mkb\w*|ondernemer\w*|bedrijven\b|faillissement\w*|horeca\w*|detailhandel\w*|winkel\w*|logistiek\w*|transport\w*|schoonmaak\w*|starters)/i, rubriek: "ondernemen" },
];

/** In welke rubriek een bericht valt, of null als het niet bij ons past. De eerste treffer wint (regels vóór arbeidsmarkt vóór ondernemen). */
export function rubriekVoor(titel: string, omschrijving = ""): Rubriek | null {
  const tekst = `${titel} ${omschrijving}`;
  for (const p of PAST) if (p.re.test(tekst)) return p.rubriek;
  return null;
}

// --- de tekst van de bronpagina -------------------------------------------------------------------

/** De leesbare tekst van een webpagina: zonder scripts, stijl, menu en voettekst. Ingekort tot `max` tekens. */
export function paginaTekst(html: string, max = 6000): string {
  const kern = /<main[\s>][\s\S]*?<\/main>/i.exec(html)?.[0] ?? /<article[\s>][\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
  const tekst = ontcijfer(
    kern
      .replace(/<(script|style|noscript|svg|nav|header|footer|form|figure|aside|table)[\s>][\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|h[1-6]|li|div|section|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  // een regel die vooral uit cijfers bestaat is een tabel onder een grafiek: geen leestekst, en hij zou de controle op
  // getallen (elk getal moet in de bron staan) veel te ruim maken
  const regels = tekst.split("\n").filter((r) => r.length < 160 || (r.match(/\d/g)?.length ?? 0) / r.length < 0.12);
  return regels.join("\n").slice(0, max);
}

// --- de harde controle op wat het model schreef ---------------------------------------------------

const cijfers = (s: string) => s.replace(/\./g, "").replace(",", ".");

/**
 * Getallen in onze tekst die niet in de brontekst staan. Een model mag samenvatten, niet rekenen of raden: staat er
 * "9,4 procent" in ons bericht, dan moet "9,4" ook in de bron staan. Jaartallen van nu en losse cijfers 0-12 (zoals
 * "drie maanden" geschreven als "3") tellen niet mee.
 */
export function getallenBuitenBron(onze: string, bron: string, nu = new Date()): string[] {
  const inBron = new Set([...bron.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => cijfers(m[0])));
  const jaar = nu.getUTCFullYear();
  const vrij = new Set([String(jaar - 1), String(jaar), String(jaar + 1)]);
  const fout: string[] = [];
  for (const m of onze.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const g = cijfers(m[0]);
    if (inBron.has(g) || vrij.has(g)) continue;
    if (/^\d+$/.test(g) && Number(g) <= 12) continue;
    if (!fout.includes(m[0])) fout.push(m[0]);
  }
  return fout;
}

/** Dingen die ZekerFlex niet belooft of niet heeft; een nieuwsbericht mag ze er niet in schrijven. */
const VERBODEN: readonly { re: RegExp; reden: string }[] = [
  { re: /\b(betaalpas|bankpas|zekerflex bank|voorschot|doorverwijsbonus)\b/i, reden: "noemt iets van de gestopte ZekerFlex Bank" },
  { re: /\b(gegarandeerd|garantie|marktleider|goedkoopste|nummer\s?1|beste van nederland)\b/i, reden: "bevat een garantie of superlatief" },
  { re: /\b(wij verzekeren|bij ons verzekerd|via zekerflex verzekerd|onze verzekering)\b/i, reden: "belooft een verzekering die er niet is" },
  { re: /(https?:\/\/|www\.)/i, reden: "bevat een link in de tekst (de bron staat er apart onder)" },
  { re: /\b(als ai|als taalmodel|ik kan niet|bronvermelding ontbreekt)\b/i, reden: "bevat een zin van het model zelf" },
];

export interface Oordeel {
  goed: boolean;
  reden: string | null;
}

/** Het aantal woorden van titel, samenvatting, koppen en alinea's samen. */
export const aantalWoorden = (b: Pick<NieuwsBericht, "titel" | "samenvatting" | "blokken">) =>
  [b.titel, b.samenvatting, ...b.blokken.flatMap((x) => [x.kop ?? "", ...x.alineas])].join("\n").split(/\s+/).filter(Boolean).length;

/** Mag dit bericht geplaatst worden? Controleert lengte, verboden beloftes en of elk getal in de bron staat. */
export function beoordeelBericht(b: Pick<NieuwsBericht, "titel" | "samenvatting" | "blokken">, bronTekst: string, nu = new Date()): Oordeel {
  const tekst = [b.titel, b.samenvatting, ...b.blokken.flatMap((x) => [x.kop ?? "", ...x.alineas])].join("\n");
  const woorden = tekst.split(/\s+/).filter(Boolean).length;
  if (b.titel.length < 12 || b.titel.length > 110) return { goed: false, reden: "de titel is te kort of te lang" };
  if (woorden < 90) return { goed: false, reden: `het bericht is te kort (${woorden} woorden)` };
  if (woorden > 520) return { goed: false, reden: `het bericht is te lang (${woorden} woorden)` };
  for (const v of VERBODEN) if (v.re.test(tekst)) return { goed: false, reden: v.reden };
  // het slot zegt wat de lezer eraan heeft; ontbreekt het, dan is het een kale samenvatting en geen bericht van ons
  if (!b.blokken.some((x) => /betekent/i.test(x.kop ?? ""))) return { goed: false, reden: 'het blok "Wat betekent dit voor jou?" ontbreekt' };
  // "het sterkst", "de meeste": zo'n vergelijking mag alleen als de bron hem ook maakt (18 nov: het eerste bericht
  // noemde een sector "het sterkst gegroeid" terwijl de bron dat over een andere zei)
  const bronKlein = bronTekst.toLowerCase();
  for (const m of tekst.toLowerCase().matchAll(/\b(sterkste?|meeste|grootste|kleinste|hoogste|laagste|snelste?|zwakste?|minste|record\w*)\b/g)) {
    const woord = (m[1] ?? "").replace(/e$/, "");
    if (!bronKlein.includes(woord)) return { goed: false, reden: `maakt een vergelijking ("${m[1]}") die niet in de bron staat` };
  }
  const vreemd = getallenBuitenBron(tekst, bronTekst, nu);
  if (vreemd.length) return { goed: false, reden: `noemt een getal dat niet in de bron staat: ${vreemd.slice(0, 4).join(", ")}` };
  return { goed: true, reden: null };
}

// --- het antwoord van het model soepel lezen ------------------------------------------------------

const alsTekst = (v: unknown, max: number): string => {
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim().slice(0, max);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map((x) => alsTekst(x, max)).filter(Boolean).join(" ").slice(0, max);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return alsTekst(o.tekst ?? o.text ?? o.inhoud ?? "", max);
  }
  return "";
};

/**
 * Het antwoord van het model als bericht. Een model levert soms een object waar tekst hoort, of alinea's als één tekst:
 * we maken er tekst van, slaan een leeg blok over en geven null als er geen bruikbaar bericht in zit.
 */
export function leesAntwoord(antwoord: unknown): Pick<NieuwsBericht, "titel" | "samenvatting" | "blokken"> | null {
  if (!antwoord || typeof antwoord !== "object") return null;
  const a = antwoord as Record<string, unknown>;
  const titel = alsTekst(a.titel ?? a.title, 140);
  const samenvatting = alsTekst(a.samenvatting ?? a.intro ?? a.excerpt, 320);
  const ruw = Array.isArray(a.blokken) ? a.blokken : Array.isArray(a.secties) ? a.secties : [];
  const blokken: NieuwsBlok[] = [];
  for (const item of ruw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kop = alsTekst(o.kop ?? o.heading, 90);
    const bron = o.alineas ?? o.paragraphs ?? o.tekst;
    // alinea's als één tekst: eerst op de lege regels knippen, dan pas de witruimte gladstrijken
    const delen = Array.isArray(bron) ? bron : typeof bron === "string" ? bron.split(/\r?\n\s*\r?\n/) : [bron];
    const alineas = delen.map((x) => alsTekst(x, 900)).filter((x) => x.length >= 20);
    if (alineas.length) blokken.push({ ...(kop ? { kop } : {}), alineas: alineas.slice(0, 4) });
  }
  if (!titel || !samenvatting || blokken.length === 0) return null;
  return { titel, samenvatting, blokken: blokken.slice(0, 5) };
}

// --- klein gereedschap ----------------------------------------------------------------------------

/** "Werkloosheid stijgt: 4,1%!" -> "werkloosheid-stijgt-4-1" */
export function maakSlug(titel: string): string {
  const s = titel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  return s || "bericht";
}

export function uniekeSlug(basis: string, bestaand: Iterable<string>): string {
  const bezet = new Set(bestaand);
  if (!bezet.has(basis)) return basis;
  let n = 2;
  while (bezet.has(`${basis}-${n}`)) n++;
  return `${basis}-${n}`;
}

export const leesMinuten = (b: Pick<NieuwsBericht, "blokken">) => Math.max(1, Math.round(b.blokken.flatMap((x) => x.alineas).join(" ").split(/\s+/).length / 200));

/** Nieuwste eerst, op het moment van plaatsen (of maken, bij een concept). */
export const opDatum = (a: NieuwsBericht, b: NieuwsBericht) => (b.geplaatst ?? b.gemaakt).localeCompare(a.geplaatst ?? a.gemaakt);
