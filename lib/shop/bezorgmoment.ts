import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { easterMonthDay } from "@/lib/time/easter";

// ---------------------------------------------------------------------------
// Het bezorgmoment op de productpagina en de kaartjes, zoals bol.com: "Bestel binnen 2 uur en 14 min, morgen in huis"
// (15 nov 2026). Alleen wat echt kan: we versturen op werkdagen tot 22:00 en bezorgd wordt op de volgende werkdag; in het
// weekend en op feestdagen gaat er niets weg en wordt er niet bezorgd. Daarom zegt de pagina op zaterdag "dinsdag in huis"
// en op vrijdagmiddag "Bestel binnen …, maandag in huis". Producten van een verkoper krijgen dit niet: die versturen zelf
// (lib/shop/verkoper-core.ts). Nederlandse tijd (lib/time/amsterdam.ts), nooit de klok van de server. Puur; de pagina
// rekent het pas in de browser uit (geen hydratiefout).
// ---------------------------------------------------------------------------

/** Tot dit uur (Nederlandse tijd) op een werkdag besteld = dezelfde dag verstuurd. */
export const BESTEL_VOOR_UUR = 22;

export interface Dag {
  year: number;
  month: number;
  day: number;
}

export interface Bezorgmoment {
  /** de dag waarop het pakket komt (Nederlandse kalender) */
  bezorgdag: Dag;
  /** zoveel kalenderdagen na vandaag: 1 = morgen */
  dagen: number;
  /** minuten tot de grens van vandaag als het vandaag nog weggaat, anders null */
  resterendMin: number | null;
}

const sleutel = (d: Dag) => `${d.year}-${d.month}-${d.day}`;

function plusDagen(d: Dag, n: number): Dag {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

const weekdag = (d: Dag) => new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();

/** De dagen waarop PostNL en DHL geen pakketten bezorgen en wij niets versturen. */
export function feestdagen(year: number): Set<string> {
  const pasen = easterMonthDay(year);
  const p: Dag = { year, month: pasen.month, day: pasen.day };
  // Koningsdag: 27 april, of 26 april als de 27e op zondag valt
  const koning: Dag = { year, month: 4, day: weekdag({ year, month: 4, day: 27 }) === 0 ? 26 : 27 };
  return new Set(
    [
      { year, month: 1, day: 1 }, // Nieuwjaarsdag
      p, // Eerste paasdag
      plusDagen(p, 1), // Tweede paasdag
      koning,
      plusDagen(p, 39), // Hemelvaartsdag
      plusDagen(p, 49), // Eerste pinksterdag
      plusDagen(p, 50), // Tweede pinksterdag
      { year, month: 12, day: 25 },
      { year, month: 12, day: 26 },
    ].map(sleutel),
  );
}

/** Maandag t/m vrijdag en geen feestdag. */
export function isWerkdag(d: Dag): boolean {
  const w = weekdag(d);
  return w >= 1 && w <= 5 && !feestdagen(d.year).has(sleutel(d));
}

function volgendeWerkdag(d: Dag): Dag {
  let n = plusDagen(d, 1);
  for (let i = 0; i < 14 && !isWerkdag(n); i++) n = plusDagen(n, 1);
  return n;
}

export function bezorgmoment(nu: Date): Bezorgmoment {
  const p = amsterdamParts(nu);
  const vandaag: Dag = { year: p.year, month: p.month, day: p.day };
  const grens = amsterdamToUtc(p.year, p.month, p.day, BESTEL_VOOR_UUR);
  const vandaagWeg = isWerkdag(vandaag) && nu.getTime() < grens.getTime();
  const verzenddag = vandaagWeg ? vandaag : volgendeWerkdag(vandaag);
  const bezorgdag = volgendeWerkdag(verzenddag);
  const dagen = Math.round((Date.UTC(bezorgdag.year, bezorgdag.month - 1, bezorgdag.day) - Date.UTC(p.year, p.month - 1, p.day)) / 86_400_000);
  return {
    bezorgdag,
    dagen,
    resterendMin: vandaagWeg ? Math.max(1, Math.ceil((grens.getTime() - nu.getTime()) / 60_000)) : null,
  };
}

/** "morgen", of de naam van de dag ("maandag", "Monday") als het later is. */
export function bezorgdagNaam(b: Bezorgmoment, morgen: string, locale: string): string {
  if (b.dagen === 1) return morgen;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-NL", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(b.bezorgdag.year, b.bezorgdag.month - 1, b.bezorgdag.day)),
  );
}

export interface BezorgTeksten {
  /** "Bestel binnen {tijd}, {dag} in huis" */
  aftellen: string;
  /** "Nu besteld, {dag} in huis" */
  nu: string;
  morgen: string;
  uurEnMin: string;
  uren: string;
  minuten: string;
}

/** De hele zin voor de productpagina. */
export function bezorgZin(b: Bezorgmoment, t: BezorgTeksten, locale: string): string {
  const dag = bezorgdagNaam(b, t.morgen, locale);
  if (b.resterendMin === null) return t.nu.replace("{dag}", dag);
  return t.aftellen.replace("{tijd}", resterendTekst(b.resterendMin, t)).replace("{dag}", dag);
}

/** "2 uur en 14 min", "45 min" of "1 uur". */
export function resterendTekst(min: number, teksten: { uurEnMin: string; uren: string; minuten: string }): string {
  const u = Math.floor(min / 60);
  const m = min % 60;
  if (u > 0 && m > 0) return teksten.uurEnMin.replace("{u}", String(u)).replace("{m}", String(m));
  if (u > 0) return teksten.uren.replace("{u}", String(u));
  return teksten.minuten.replace("{m}", String(m));
}
