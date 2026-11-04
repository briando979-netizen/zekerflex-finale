import { beschikbaarheid, isDatum, minuten, plusDagen, reserveerFout, slotsOp, weekdag, type Bezet, type ReserveerInstellingen } from "@/lib/horeca/reserveren";
import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import type { Dag, Openingstijden } from "@/lib/horeca/tijden";
import type { BlockProps, Page } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Een tafel reserveren op een klantsite (4 nov 2026, opdracht van de eigenaar:
// "als een restaurant om gaat bouw je een reserveringsysteem erbij"). Het blok
// "reserveren" vraagt dag en aantal personen; …/reserveren toont de vrije
// tijden en de gegevens; …/_zf/reservering bewaart (lib/sites/reserveringen.ts).
// Zonder scripts, zoals de rest van een klantsite. De rekenregels (tijden,
// capaciteit, hoe lang een tafel bezet is) zijn die van het horecapakket
// (lib/horeca/reserveren.ts). Puur: ook de bouwer en de tests gebruiken dit.
// ---------------------------------------------------------------------------

export type ReserveerBlok = BlockProps["reserveren"];

/** Het eerste reserveerblok van de site: daar staan de tijden en instellingen; null = geen online reserveren. */
export function reserveerBlokVan(pages: Pick<Page, "blocks">[]): ReserveerBlok | null {
  for (const p of pages) {
    for (const b of p.blocks) if (b.type === "reserveren") return b.props;
  }
  return null;
}

export const instellingenVan = (b: ReserveerBlok): ReserveerInstellingen => ({
  slotMinuten: b.slotMinuten,
  verblijfMinuten: b.verblijfMinuten,
  maxGroep: b.maxGroep,
  dagenVooruit: b.dagenVooruit,
  maxGasten: b.maxGasten,
});

/** Wat een gast invult. */
export interface ReserveerInvoer {
  datum: string;
  tijd: string;
  personen: number;
  naam: string;
  email: string;
  telefoon: string;
  /** allergieën, een kinderstoel, een verjaardag */
  opmerking: string;
}

const knip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Een formulier of de adresregel uitlezen; wat niet klopt wordt leeg (de controle zegt dan wat er mist). */
export function leesReserveerInvoer(get: (naam: string) => unknown): ReserveerInvoer {
  const datum = knip(get("datum"), 10);
  const tijd = knip(get("tijd"), 5);
  const personen = Math.floor(Number(get("personen") ?? 0));
  return {
    datum: isDatum(datum) ? datum : "",
    tijd: /^([01]\d|2[0-3]):[0-5]\d$/.test(tijd) ? tijd : "",
    personen: Number.isFinite(personen) && personen > 0 ? Math.min(personen, 500) : 0,
    naam: knip(get("naam"), 100),
    email: knip(get("email"), 200),
    telefoon: knip(get("telefoon"), 30),
    opmerking: knip(get("opmerking"), 600),
  };
}

const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** "2026-11-06" → "vrijdag 6 november" (met het jaar erbij als het niet dit jaar is). Zonder klok of tijdzone. */
export function datumTekst(datum: string, ditJaar?: number): string {
  if (!isDatum(datum)) return datum;
  const [j, m, d] = datum.split("-").map(Number) as [number, number, number];
  const jaar = ditJaar !== undefined && j !== ditJaar ? ` ${j}` : "";
  return `${DAGEN[Number(weekdag(datum))]} ${d} ${MAANDEN[m - 1]}${jaar}`;
}

/** "1 persoon", "4 personen". */
export const personenTekst = (n: number) => (n === 1 ? "1 persoon" : `${n} personen`);

export type Nu = { datum: string; minuten: number };

/** De dag en de minuten na middernacht in Nederland (de server draait in UTC). */
export function nuInNL(d = new Date()): Nu {
  const p = amsterdamParts(d);
  return { datum: amsterdamDayKey(d), minuten: p.hour * 60 + p.minute };
}

/** De tijden van een dag voor een groep, met of ze vrij zijn. `vol`: tijden die op een voorbeeldsite vastzitten (voorbeeldVol). */
export function tijdenVoor(b: ReserveerBlok, datum: string, personen: number, bezet: readonly Bezet[], nu: Nu, vol?: ReadonlySet<string>) {
  const tijden = beschikbaarheid(datum, personen, b.tijden, instellingenVan(b), b.maxGasten, bezet, nu);
  return vol ? tijden.map((t) => (vol.has(t.tijd) ? { ...t, vrij: false } : t)) : tijden;
}

/** Of er op die dag nog iets vrij is (voor "eerstvolgende dagen met plek"). */
export const heeftPlek = (b: ReserveerBlok, datum: string, personen: number, bezet: readonly Bezet[], nu: Nu, vol?: ReadonlySet<string>) =>
  tijdenVoor(b, datum, personen, bezet, nu, vol).some((t) => t.vrij);

/** Elke regel van de reservering die niet klopt, als zin voor de gast; leeg = in orde. */
export function controleerReservering(b: ReserveerBlok, r: ReserveerInvoer, bezet: readonly Bezet[], nu: Nu, vol?: ReadonlySet<string>): string[] {
  const fouten: string[] = [];
  if (!r.tijd) fouten.push("Kies een tijd.");
  else {
    const fout = reserveerFout({ datum: r.datum, tijd: r.tijd, personen: r.personen }, b.tijden, instellingenVan(b), b.maxGasten, bezet, nu);
    if (fout) fouten.push(fout);
    else if (vol?.has(r.tijd)) fouten.push("Die tijd is net vol geraakt. Kies een andere tijd.");
  }
  if (!r.naam) fouten.push("Vul je naam in.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email)) fouten.push("Vul een geldig e-mailadres in, daar sturen we de bevestiging heen.");
  if (r.telefoon.replace(/\D/g, "").length < 8) fouten.push("Vul je telefoonnummer in, dan kunnen we je bellen als er iets verandert.");
  return fouten;
}

/** De laatste dag waarop online reserveren kan. */
export const laatsteDag = (b: ReserveerBlok, vandaag: string) => plusDagen(vandaag, b.dagenVooruit);

/** De weekdagen met hun reserveertijden, maandag eerst ("Maandag", "Gesloten" / "17:00 – 21:30"), voor de kaart naast het formulier. */
export function reserveerUren(b: ReserveerBlok): { dag: string; tijd: string }[] {
  return (["1", "2", "3", "4", "5", "6", "0"] as const).map((d) => {
    const t = b.tijden[d];
    return { dag: DAGEN[Number(d)]!.replace(/^./, (c) => c.toUpperCase()), tijd: t ? `${t.van} – ${laatsteAankomst(b, t) ?? t.tot}` : "Gesloten" };
  });
}

/** De laatste tijd waarop je nog kunt aankomen (sluiting min het verblijf), of null als er geen enkele tijd past. */
function laatsteAankomst(b: ReserveerBlok, t: { van: string; tot: string }): string | null {
  const vanM = minuten(t.van);
  let totM = minuten(t.tot);
  if (totM <= vanM) totM += 24 * 60;
  const laatste = totM - b.verblijfMinuten;
  if (laatste < vanM) return null;
  const slot = Math.floor(laatste / b.slotMinuten) * b.slotMinuten;
  return `${String(Math.floor(slot / 60) % 24).padStart(2, "0")}:${String(slot % 60).padStart(2, "0")}`;
}

/**
 * Een voorbeeld- of voorstelsite heeft geen echte reserveringen. Om te laten zien hoe "vol" eruitziet,
 * zit ongeveer een op de vier tijden vast: elke dag andere, maar voor die dag steeds dezelfde (geen toeval per bezoek).
 */
export function voorbeeldVol(b: ReserveerBlok, datum: string): Set<string> {
  let h = 2166136261;
  for (const c of datum) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const uit = new Set<string>();
  slotsOp(datum, b.tijden, instellingenVan(b)).forEach((m, i) => {
    h = Math.imul(h ^ i, 2654435761) >>> 0;
    if (h >>> 30 === 0) uit.add(`${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  });
  return uit;
}

export type ReserveerStatus = "bevestigd" | "aangekomen" | "niet-gekomen" | "geannuleerd";
export const RESERVEER_STATUSSEN: ReserveerStatus[] = ["bevestigd", "aangekomen", "niet-gekomen", "geannuleerd"];

export interface SiteReservering extends ReserveerInvoer {
  /** "r20261106" + willekeur: de datum zit erin, zodat de sleutel uit het id volgt */
  id: string;
  /** wat de gast en de zaak noemen ("K7M3Q2") */
  nr: string;
  at: string;
  status: ReserveerStatus;
  /** online door de gast, of door de zaak zelf (telefoon, aan de bar) */
  bron: "website" | "beheer";
}

/** Een zaak waar je aan tafel eet (restaurant, brasserie, grill): daar hoort online reserveren bij; een bakker of slager niet. */
export const isTafelZaak = (tekst: string) =>
  /restaurant|brasserie|bistro|eetcaf|caf[eé]|grand.?caf|grill|pizzeria|trattoria|osteria|tapas|wijnbar|steakhouse|burger|sushi|\bwok|lunchroom|eethuis|\bdiner\b|keuken van/i.test(tekst);

const DAG_NR: Record<string, Dag> = { maandag: "1", dinsdag: "2", woensdag: "3", donderdag: "4", vrijdag: "5", zaterdag: "6", zondag: "0" };
const WEEK: Dag[] = ["1", "2", "3", "4", "5", "6", "0"];

/**
 * De openingstijden zoals de website-check ze leest ({ dag: "Maandag t/m vrijdag", tijd: "11:00 – 22:00" },
 * lib/website-check/inlezen.ts) als reserveertijden per weekdag. Een dag die er niet staat is dicht;
 * twee blokken op een dag (lunch en diner) worden van het eerste begin tot het laatste eind.
 * null als er geen enkele open dag uit te halen is: dan verzinnen we geen tijden.
 */
export function tijdenUitUren(regels: readonly { dag: string; tijd: string }[]): Openingstijden | null {
  const uit: Openingstijden = { "0": null, "1": null, "2": null, "3": null, "4": null, "5": null, "6": null };
  let open = 0;
  for (const r of regels) {
    const m = /^(\p{L}+)(?:\s+t\/m\s+(\p{L}+))?$/u.exec(r.dag.trim().toLowerCase());
    const a = m?.[1] ? WEEK.indexOf(DAG_NR[m[1]] ?? ("x" as Dag)) : -1;
    const b = m?.[2] ? WEEK.indexOf(DAG_NR[m[2]] ?? ("x" as Dag)) : a;
    if (a < 0 || b < 0) continue;
    const blokken = [...r.tijd.matchAll(/(\d{2}):(\d{2})\s*–\s*(\d{2}):(\d{2})/g)];
    const eerste = blokken[0];
    const laatste = blokken[blokken.length - 1];
    const klokje = (h: string, mm: string) => `${h === "24" ? "00" : h}:${mm}`;
    const t = eerste && laatste ? { van: klokje(eerste[1]!, eerste[2]!), tot: klokje(laatste[3]!, laatste[4]!) } : null;
    const geldig = t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.van) && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.tot) && t.van !== t.tot ? t : null;
    for (let i = a, n = 0; n < 7; i = (i + 1) % 7, n++) {
      uit[WEEK[i]!] = geldig;
      if (i === b) break;
    }
    if (geldig) open++;
  }
  return open ? uit : null;
}

/** Een reserveringsnummer zoals lib/sites/reserveringen.ts ze maakt: zes tekens zonder 0/O, 1/I/L. */
export const isReserveerNummer = (s: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(s);
