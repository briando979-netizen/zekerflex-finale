// ---------------------------------------------------------------------------
// Offertes: de gegevens, de controle van invoer (met Nederlandse fouten) en de statusovergangen. Puur: geen database,
// geen klok (elke functie krijgt `nu`), zodat alles te testen is. Opslag: lib/offertes/store.ts.
//
// Status: concept → verstuurd → geaccepteerd | afgewezen. "Verlopen" is geen opgeslagen status maar volgt uit de datum
// (geldig tot is de laatste dag dat de klant nog kan reageren, Nederlandse dag): `effectieveStatus`. Een geaccepteerde of
// afgewezen offerte is vergrendeld; wie iets wil veranderen maakt een kopie (nieuw nummer, concept).
// ---------------------------------------------------------------------------

import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { BTW_TARIEVEN, berekenTotalen, type OfferteTotalen } from "@/lib/offertes/rekenen";

export const MAX_REGELS = 100;
export const MAX_VOORWAARDEN = 2_000;
export const STANDAARD_GELDIG_DAGEN = 30;
export const MAX_AANTAL = 1_000_000;
export const MAX_PRIJS_CENT = 100_000_000; // € 1.000.000 per eenheid
export const MAX_REGEL_CENT = 10_000_000_000; // € 100 miljoen per regel

export type OfferteStatus = "concept" | "verstuurd" | "geaccepteerd" | "afgewezen";
export type EffectieveStatus = OfferteStatus | "verlopen";

export const STATUS_NAAM: Record<EffectieveStatus, string> = {
  concept: "Concept",
  verstuurd: "Verstuurd",
  geaccepteerd: "Geaccepteerd",
  afgewezen: "Afgewezen",
  verlopen: "Verlopen",
};

export const DAG_SLEUTEL = /^\d{4}-\d{2}-\d{2}$/;
export const OFFERTE_ID = /^o[0-9a-f]{12}$/;
export const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export interface OfferteKlant {
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
}

export interface OfferteRegel {
  omschrijving: string;
  aantal: number;
  eenheid: string;
  prijsCent: number;
  btw: number;
}

/** Wat het bedrijf zelf invult en wijzigt. */
export interface OfferteInhoud {
  klant: OfferteKlant;
  titel: string;
  inleiding: string;
  regels: OfferteRegel[];
  /** korting over het geheel, in honderdsten van een procent (1250 = 12,5%) */
  kortingBp: number;
  /** "2026-12-12": de laatste dag dat de klant kan reageren */
  geldigTot: string;
  voorwaarden: string;
}

export interface OfferteReactie {
  /** wat de klant koos */
  keuze: "geaccepteerd" | "afgewezen";
  /** de naam die de klant invulde (bij akkoord verplicht); het IP-adres bewaren we bewust NIET */
  naam: string;
  reden: string;
  op: string;
}

export interface Offerte extends OfferteInhoud {
  id: string;
  /** OF-2026-0001 */
  nummer: string;
  status: OfferteStatus;
  /** een snapshot van de bedrijfsnaam op het moment van versturen, voor de openbare pagina */
  bedrijfsnaam: string;
  /** hash van de geheime link; de link zelf staat nergens */
  tokenHash?: string | undefined;
  gemaaktOp: string;
  gewijzigdOp: string;
  verstuurdOp?: string | undefined;
  reactie?: OfferteReactie | undefined;
  /** gemaakt als kopie van deze offerte (nummer) */
  kopieVan?: string | undefined;
  /** de klantgegevens zijn gewist (recht op vergetelheid) */
  klantGewist?: boolean | undefined;
}

export type Uitkomst<T> = { ok: true; waarde: T } | { ok: false; fout: string; code?: "VERGRENDELD" | "STATUS" };

const goed = <T>(waarde: T): Uitkomst<T> => ({ ok: true, waarde });
const fout = (f: string, code?: "VERGRENDELD" | "STATUS"): Uitkomst<never> => (code ? { ok: false, fout: f, code } : { ok: false, fout: f });

// --- tekst en datum ------------------------------------------------------------

/** Tekst schoonmaken: stuurtekens weg, spaties inkorten, begrenzen. Regeleinden blijven in lange tekst. */
export function schoneTekst(v: unknown, max: number, meerdereRegels = false): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const t = v.replace(meerdereRegels ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ");
  return (meerdereRegels ? t.replace(/\r\n?/g, "\n").trim() : t.replace(/\s+/g, " ").trim()).slice(0, max);
}

/** Een dag plus n dagen ("2026-11-12" + 30), zonder tijdzone-gedoe. */
export function plusDagen(dag: string, n: number): string {
  const [j, m, d] = dag.split("-").map(Number);
  return new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

/** De standaard "geldig tot": 30 dagen na vandaag (Nederlandse dag). */
export const standaardGeldigTot = (nu: Date): string => plusDagen(amsterdamDayKey(nu), STANDAARD_GELDIG_DAGEN);

/** "donderdag 12 november 2026" */
export function nlDag(dag: string): string {
  if (!DAG_SLEUTEL.test(dag)) return dag;
  return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${dag}T12:00:00Z`));
}

/** "12 november 2026 om 14:05", Nederlandse tijd. */
export function nlMoment(iso: string): string {
  const d = new Date(iso);
  const dag = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(d);
  const klok = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(d);
  return `${dag} om ${klok}`;
}

/** Is de dag een echte kalenderdag? ("2026-02-30" niet.) */
export function geldigeDag(dag: string): boolean {
  if (!DAG_SLEUTEL.test(dag)) return false;
  return plusDagen(dag, 0) === dag;
}

// --- controle van invoer ----------------------------------------------------------

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Controleert wat het bedrijf invulde. Een volledig lege regel wordt overgeslagen; een regel met een prijs maar zonder
 * omschrijving is een fout. Voor een concept hoeft nog niet alles ingevuld; `controleerKlaarVoorVersturen` bewaakt dat.
 */
export function controleerInhoud(raw: unknown, nu: Date): Uitkomst<OfferteInhoud> {
  const o = asObj(raw);
  const k = asObj(o.klant);
  const klant: OfferteKlant = { naam: schoneTekst(k.naam, 80), email: schoneTekst(k.email, 120).toLowerCase(), telefoon: schoneTekst(k.telefoon, 30), adres: schoneTekst(k.adres, 200, true) };
  if (klant.email && !EMAIL.test(klant.email)) return fout("Dit e-mailadres van de klant lijkt niet te kloppen.");
  if (klant.telefoon && !/^[+\d][\d\s().-]{5,}$/.test(klant.telefoon)) return fout("Dit telefoonnummer van de klant lijkt niet te kloppen.");

  const lijst = Array.isArray(o.regels) ? o.regels : [];
  if (lijst.length > MAX_REGELS) return fout(`Een offerte heeft hoogstens ${MAX_REGELS} regels.`);
  const regels: OfferteRegel[] = [];
  for (let n = 0; n < lijst.length; n++) {
    const r = asObj(lijst[n]);
    const omschrijving = schoneTekst(r.omschrijving, 200);
    const leeg = !omschrijving && (r.prijsCent === undefined || r.prijsCent === null || r.prijsCent === 0 || r.prijsCent === "");
    if (leeg) continue;
    const nr = `Regel ${n + 1}`;
    if (!omschrijving) return fout(`${nr}: vul een omschrijving in.`);
    const aantal = typeof r.aantal === "number" ? r.aantal : Number.NaN;
    if (!Number.isFinite(aantal) || aantal <= 0) return fout(`${nr}: het aantal moet groter zijn dan nul.`);
    if (aantal > MAX_AANTAL) return fout(`${nr}: het aantal is te groot.`);
    if (Math.abs(aantal * 1000 - Math.round(aantal * 1000)) > 1e-6) return fout(`${nr}: gebruik hoogstens 3 decimalen bij het aantal.`);
    const prijsCent = typeof r.prijsCent === "number" ? r.prijsCent : Number.NaN;
    if (!Number.isInteger(prijsCent) || prijsCent < 0) return fout(`${nr}: vul een prijs in van nul of meer (hele centen).`);
    if (prijsCent > MAX_PRIJS_CENT) return fout(`${nr}: de prijs is te hoog.`);
    const btw = typeof r.btw === "number" ? r.btw : Number.NaN;
    if (!(BTW_TARIEVEN as readonly number[]).includes(btw)) return fout(`${nr}: kies 0%, 9% of 21% btw.`);
    const regel: OfferteRegel = { omschrijving, aantal: Math.round(aantal * 1000) / 1000, eenheid: schoneTekst(r.eenheid, 20) || "stuk", prijsCent, btw };
    if (berekenTotalen([regel]).totaalCent > MAX_REGEL_CENT) return fout(`${nr}: het bedrag is te hoog.`);
    regels.push(regel);
  }

  let kortingBp = 0;
  if (o.kortingPct !== undefined && o.kortingPct !== null && o.kortingPct !== "") {
    const p = typeof o.kortingPct === "number" ? o.kortingPct : Number.NaN;
    if (!Number.isFinite(p) || p < 0 || p > 100) return fout("De korting is een percentage van 0 tot 100.");
    if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) return fout("Gebruik hoogstens 2 decimalen bij de korting.");
    kortingBp = Math.round(p * 100);
  }

  const dag = o.geldigTot === undefined || o.geldigTot === null || o.geldigTot === "" ? standaardGeldigTot(nu) : String(o.geldigTot);
  if (!geldigeDag(dag)) return fout("Kies een geldige datum bij 'geldig tot'.");
  if (dag > plusDagen(amsterdamDayKey(nu), 3 * 365)) return fout("Een offerte kan hoogstens drie jaar geldig zijn.");

  const voorwaarden = schoneTekst(o.voorwaarden, MAX_VOORWAARDEN + 1, true);
  if (voorwaarden.length > MAX_VOORWAARDEN) return fout(`De voorwaarden mogen hoogstens ${MAX_VOORWAARDEN} tekens zijn.`);
  const titel = schoneTekst(o.titel, 120);
  const inleiding = schoneTekst(o.inleiding, 2_000, true);
  return goed({ klant, titel, inleiding, regels, kortingBp, geldigTot: dag, voorwaarden });
}

/** Wat er minstens moet staan voordat een offerte de deur uit gaat. */
export function controleerKlaarVoorVersturen(i: OfferteInhoud, nu: Date): Uitkomst<true> {
  if (i.klant.naam.length < 2) return fout("Vul de naam van de klant in voordat je de offerte verstuurt.");
  if (!i.titel) return fout("Geef de offerte een titel voordat je hem verstuurt.");
  if (i.regels.length === 0) return fout("Voeg minstens één regel toe voordat je de offerte verstuurt.");
  if (i.geldigTot < amsterdamDayKey(nu)) return fout("De offerte is al verlopen: kies een 'geldig tot' in de toekomst.");
  return goed(true);
}

export const totalenVan = (i: Pick<OfferteInhoud, "regels" | "kortingBp">): OfferteTotalen => berekenTotalen(i.regels, i.kortingBp);

export const inhoudVan = (o: Offerte): OfferteInhoud => ({ klant: o.klant, titel: o.titel, inleiding: o.inleiding, regels: o.regels, kortingBp: o.kortingBp, geldigTot: o.geldigTot, voorwaarden: o.voorwaarden });

// --- status en overgangen ------------------------------------------------------------

/** Verstuurd + 'geldig tot' voorbij = verlopen. De opgeslagen status verandert nooit stilzwijgend. */
export function effectieveStatus(o: Pick<Offerte, "status" | "geldigTot">, nu: Date): EffectieveStatus {
  return o.status === "verstuurd" && o.geldigTot < amsterdamDayKey(nu) ? "verlopen" : o.status;
}

const VERGRENDELD = "Deze offerte is al beantwoord door de klant en kan niet meer veranderd worden. Maak een kopie als nieuwe versie.";

export function kanBewerken(o: Offerte): Uitkomst<true> {
  if (o.status === "concept") return goed(true);
  if (o.status === "verstuurd") return fout("Deze offerte is al verstuurd. Trek hem eerst in om hem te bewerken, of maak een kopie.", "STATUS");
  return fout(VERGRENDELD, "VERGRENDELD");
}

/** concept → verstuurd. De link (de hash van de token) hoort bij het versturen. */
export function versturen(o: Offerte, tokenHash: string, bedrijfsnaam: string, nu: Date): Uitkomst<Offerte> {
  if (o.status !== "concept") return fout(o.status === "verstuurd" ? "Deze offerte is al verstuurd." : VERGRENDELD, o.status === "verstuurd" ? "STATUS" : "VERGRENDELD");
  const klaar = controleerKlaarVoorVersturen(inhoudVan(o), nu);
  if (!klaar.ok) return klaar;
  const { reactie: _reactie, ...rest } = o;
  void _reactie;
  return goed({ ...rest, status: "verstuurd", tokenHash, bedrijfsnaam, verstuurdOp: nu.toISOString(), gewijzigdOp: nu.toISOString() });
}

/** Een verstuurde offerte een nieuwe link geven (de oude werkt dan niet meer), bijvoorbeeld als de link kwijt is. */
export function nieuweLink(o: Offerte, tokenHash: string, nu: Date): Uitkomst<Offerte> {
  if (o.status !== "verstuurd") return fout(o.status === "concept" ? "Een concept heeft nog geen link: verstuur hem eerst." : VERGRENDELD, o.status === "concept" ? "STATUS" : "VERGRENDELD");
  return goed({ ...o, tokenHash, gewijzigdOp: nu.toISOString() });
}

/** verstuurd (ook verlopen) → concept; de link werkt niet meer. */
export function intrekken(o: Offerte, nu: Date): Uitkomst<Offerte> {
  if (o.status !== "verstuurd") return fout(o.status === "concept" ? "Deze offerte is nog een concept." : VERGRENDELD, o.status === "concept" ? "STATUS" : "VERGRENDELD");
  const { tokenHash: _t, verstuurdOp: _v, ...rest } = o;
  void _t;
  void _v;
  return goed({ ...rest, status: "concept", gewijzigdOp: nu.toISOString() });
}

/** verstuurd → geaccepteerd/afgewezen, alleen door de klant, alleen zolang hij niet verlopen is. */
export function reageer(o: Offerte, keuze: "geaccepteerd" | "afgewezen", naam: string, reden: string, nu: Date): Uitkomst<Offerte> {
  if (o.status === "geaccepteerd") return fout("Deze offerte is al geaccepteerd.", "VERGRENDELD");
  if (o.status === "afgewezen") return fout("Deze offerte is al afgewezen.", "VERGRENDELD");
  if (o.status !== "verstuurd") return fout("Deze offerte is niet (meer) beschikbaar.", "STATUS");
  if (effectieveStatus(o, nu) === "verlopen") return fout("Deze offerte is verlopen. Neem contact op met het bedrijf als je hem toch wilt accepteren.", "STATUS");
  const schoon = schoneTekst(naam, 80);
  if (keuze === "geaccepteerd" && schoon.length < 2) return fout("Vul je naam in om akkoord te gaan.");
  return goed({ ...o, status: keuze, reactie: { keuze, naam: schoon, reden: schoneTekst(reden, 500, true), op: nu.toISOString() }, gewijzigdOp: nu.toISOString() });
}

/**
 * Een kopie als nieuw concept: nieuw id en nummer, 30 dagen geldig, geen link en geen reactie. Zijn de klantgegevens van het
 * origineel gewist (recht op vergetelheid), dan blijven ze ook in de kopie leeg: wissen mag nooit via een kopie terugkomen.
 */
export function kopie(o: Offerte, id: string, nummer: string, nu: Date): Offerte {
  return {
    ...inhoudVan(o),
    ...(o.klantGewist ? { klant: { naam: "", email: "", telefoon: "", adres: "" } } : {}),
    geldigTot: standaardGeldigTot(nu),
    id,
    nummer,
    status: "concept",
    bedrijfsnaam: o.bedrijfsnaam,
    gemaaktOp: nu.toISOString(),
    gewijzigdOp: nu.toISOString(),
    kopieVan: o.nummer,
  };
}

/** Klantgegevens wissen (gegevens van derden): naam, adres, e-mail, telefoon, en de naam van wie reageerde. */
export function klantWissen(o: Offerte, nu: Date): Offerte {
  const { tokenHash: _t, ...rest } = o;
  void _t;
  return {
    ...rest,
    klant: { naam: "Verwijderd", email: "", telefoon: "", adres: "" },
    ...(o.reactie ? { reactie: { ...o.reactie, naam: "Verwijderd" } } : {}),
    klantGewist: true,
    gewijzigdOp: nu.toISOString(),
  };
}

// --- uitvoer ----------------------------------------------------------------------

/** Wat het bedrijf in de lijst en op het scherm krijgt: nooit de tokenhash, wel of er een link is. */
export interface OfferteBeheer extends Omit<Offerte, "tokenHash" | "status"> {
  status: EffectieveStatus;
  heeftLink: boolean;
}

export function naarBeheer(o: Offerte, nu: Date): OfferteBeheer {
  const { tokenHash, status: _s, ...rest } = o;
  void _s;
  return { ...rest, status: effectieveStatus(o, nu), heeftLink: Boolean(tokenHash) && o.status === "verstuurd" };
}

/** Wat een klant via de link ziet: alleen de offerte zelf, nooit interne velden of het nummer van een kopie. */
export interface OfferteOpenbaar {
  bedrijfsnaam: string;
  nummer: string;
  titel: string;
  inleiding: string;
  klantNaam: string;
  regels: OfferteRegel[];
  kortingBp: number;
  geldigTot: string;
  voorwaarden: string;
  status: EffectieveStatus;
  beslistOp: string | null;
}

export function naarOpenbaar(o: Offerte, nu: Date): OfferteOpenbaar {
  return {
    bedrijfsnaam: o.bedrijfsnaam,
    nummer: o.nummer,
    titel: o.titel,
    inleiding: o.inleiding,
    klantNaam: o.klant.naam,
    regels: o.regels,
    kortingBp: o.kortingBp,
    geldigTot: o.geldigTot,
    voorwaarden: o.voorwaarden,
    status: effectieveStatus(o, nu),
    beslistOp: o.reactie?.op ?? null,
  };
}

export const nummerTekst = (jaar: number, volgnummer: number): string => `OF-${jaar}-${String(volgnummer).padStart(4, "0")}`;
