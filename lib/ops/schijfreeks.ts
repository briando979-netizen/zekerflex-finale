// De schijfreeks (16 nov 2026): elk uur de stand van de schijf van de server (gebruikt, totaal, percentage), de laatste 14 dagen, zodat de
// groei per dag echt gemeten kan worden en Admin -> Systeem -> Taken kan waarschuwen bij een trend naar 85 procent. Puur bestand (geen kv, geen
// tijd van buiten): de opslag staat in lib/ops/schijfreeks-meting.ts. Alleen getallen, geen schijfnamen of paden.
// De grootte van de Docker-buildcache zit er bewust NIET in: die kent alleen docker (system df), en de app-container heeft geen docker-socket.

export const REEKS_MAX_DAGEN = 14;
/** 14 dagen, elk uur een punt */
export const REEKS_MAX_PUNTEN = 14 * 24;
/** Twee metingen binnen deze tijd tellen als hetzelfde punt (de nieuwste wint). */
const ZELFDE_PUNT_MS = 30 * 60_000;
/** Een daling van meer dan zoveel procent van de schijf tussen twee punten is een opruiming (een knik): de trend begint daarna opnieuw. */
export const KNIK_PERCENT = 2;
/** Minimaal zoveel tijd tussen het eerste en laatste punt van de trend, anders is het te vroeg voor een betrouwbaar getal. */
export const TREND_MIN_MS = 6 * 3_600_000;
/** Een groei onder dit aantal bytes per dag is "vlak": dan geen datum (die zou duizenden dagen zijn). */
export const VLAK_BYTES_PER_DAG = 10 * 1024 ** 2;
export const DREMPEL_WAARSCHUWING = 85;
export const DREMPEL_KRITIEK = 95;
/** Waarschuw als de trend de drempel binnen zoveel dagen haalt. */
export const WAARSCHUW_BINNEN_DAGEN = 7;
const DAG_MS = 86_400_000;

export interface SchijfPunt {
  /** tijdstip in ms sinds 1970 */
  t: number;
  gebruikt: number;
  totaal: number;
  /** percentage (zoals df, op 1 decimaal) */
  pct: number;
}

/** Een punt uit de getallen van statfs; hetzelfde percentage als df (gebruikt / (gebruikt + beschikbaar)). */
export function maakPunt(blocks: number, bfree: number, bavail: number, bsize: number, t: number): SchijfPunt {
  const used = Math.max(0, blocks - bfree);
  const usable = used + bavail;
  return { t, gebruikt: used * bsize, totaal: blocks * bsize, pct: usable > 0 ? Math.round((used / usable) * 1000) / 10 : 0 };
}

const geldig = (p: unknown): p is SchijfPunt => {
  const x = p as Partial<SchijfPunt> | null;
  return Boolean(x) && [x?.t, x?.gebruikt, x?.totaal, x?.pct].every((v) => typeof v === "number" && Number.isFinite(v)) && (x?.totaal ?? 0) > 0;
};

/** De geldige punten uit een bewaarde reeks (kapotte of vreemde waarden vallen weg), op tijd gesorteerd. */
export function schoneReeks(reeks: unknown): SchijfPunt[] {
  return (Array.isArray(reeks) ? (reeks as unknown[]).filter(geldig) : []).sort((a, b) => a.t - b.t);
}

/** Voegt een punt toe: kapotte punten vallen weg, een punt binnen een half uur van het vorige vervangt dat, alles ouder dan 14 dagen en meer dan 336 punten gaat eruit. */
export function voegPuntToe(reeks: unknown, punt: SchijfPunt): SchijfPunt[] {
  if (!geldig(punt)) return Array.isArray(reeks) ? (reeks as unknown[]).filter(geldig) : [];
  const oud = (Array.isArray(reeks) ? (reeks as unknown[]).filter(geldig) : []).sort((a, b) => a.t - b.t);
  const laatste = oud[oud.length - 1];
  const basis = laatste && Math.abs(punt.t - laatste.t) < ZELFDE_PUNT_MS ? oud.slice(0, -1) : oud;
  const grens = punt.t - REEKS_MAX_DAGEN * DAG_MS;
  return [...basis, punt].filter((p) => p.t >= grens).sort((a, b) => a.t - b.t).slice(-REEKS_MAX_PUNTEN);
}

/** De punten sinds de laatste opruiming: de reeks vanaf het punt na de laatste grote daling. */
export function trendReeks(reeks: SchijfPunt[]): SchijfPunt[] {
  const r = [...reeks].sort((a, b) => a.t - b.t);
  let begin = 0;
  for (let i = 1; i < r.length; i += 1) {
    const vorig = r[i - 1] as SchijfPunt;
    const nu = r[i] as SchijfPunt;
    if (vorig.gebruikt - nu.gebruikt > (KNIK_PERCENT / 100) * nu.totaal) begin = i;
  }
  return r.slice(begin);
}

/** Groei in bytes per dag (kleinste kwadraten door de punten sinds de laatste knik); null bij te weinig punten of een te korte periode. */
export function groeiPerDag(reeks: SchijfPunt[]): number | null {
  const r = trendReeks(reeks);
  if (r.length < 2) return null;
  const eerste = r[0] as SchijfPunt;
  const laatste = r[r.length - 1] as SchijfPunt;
  if (laatste.t - eerste.t < TREND_MIN_MS) return null;
  const n = r.length;
  const xs = r.map((p) => (p.t - eerste.t) / DAG_MS);
  const gx = xs.reduce((s, x) => s + x, 0) / n;
  const gy = r.reduce((s, p) => s + p.gebruikt, 0) / n;
  let teller = 0;
  let noemer = 0;
  r.forEach((p, i) => {
    const dx = (xs[i] as number) - gx;
    teller += dx * (p.gebruikt - gy);
    noemer += dx * dx;
  });
  return noemer > 0 ? teller / noemer : null;
}

/** Over hoeveel dagen haalt de trend dit percentage? 0 = al gehaald; null = geen groei (vlak of dalend) of te weinig gegevens. */
export function dagenTot(reeks: SchijfPunt[], drempelPct: number): number | null {
  const laatste = [...reeks].sort((a, b) => a.t - b.t).pop();
  if (!laatste) return null;
  const nog = (drempelPct / 100) * laatste.totaal - laatste.gebruikt;
  if (nog <= 0) return 0;
  const groei = groeiPerDag(reeks);
  if (groei === null || groei < VLAK_BYTES_PER_DAG) return null;
  return Math.round((nog / groei) * 10) / 10;
}

export interface SchijfBeoordeling {
  laatste: SchijfPunt | null;
  punten: number;
  groeiPerDagBytes: number | null;
  dagenTot85: number | null;
  dagenTot95: number | null;
  melding: { toon: "warn" | "crit"; tekst: string } | null;
}

/** Wat het scherm toont, en of er een waarschuwing hoort: al 85 procent vol, of een trend die 85 procent binnen 7 dagen haalt. */
export function beoordeelSchijf(reeks: unknown): SchijfBeoordeling {
  const r = (Array.isArray(reeks) ? (reeks as unknown[]).filter(geldig) : []).sort((a, b) => a.t - b.t);
  const laatste = r[r.length - 1] ?? null;
  const groei = groeiPerDag(r);
  const d85 = dagenTot(r, DREMPEL_WAARSCHUWING);
  const d95 = dagenTot(r, DREMPEL_KRITIEK);
  let melding: SchijfBeoordeling["melding"] = null;
  if (laatste && laatste.pct >= DREMPEL_KRITIEK) melding = { toon: "crit", tekst: `De schijf is ${laatste.pct}% vol (kritiek).` };
  else if (laatste && laatste.pct >= DREMPEL_WAARSCHUWING) melding = { toon: "warn", tekst: `De schijf is al ${laatste.pct}% vol.` };
  else if (d85 !== null && d85 <= WAARSCHUW_BINNEN_DAGEN) melding = { toon: "warn", tekst: `Op deze groei is de schijf over ongeveer ${d85} dagen 85% vol.` };
  return { laatste, punten: r.length, groeiPerDagBytes: groei, dagenTot85: d85, dagenTot95: d95, melding };
}