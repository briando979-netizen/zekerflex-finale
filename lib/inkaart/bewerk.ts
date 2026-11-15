import { RASTER_LENGTE, legeBezetting, type BedrijfInKaart, type PersoneelGroep, type Raster, type Ruimte } from "@/lib/inkaart/model";

// Kleine, zuivere hulpjes voor het bewerken op het scherm (components/werkgever/InKaart.tsx): een invoerveld naar een getal, regels toevoegen en
// verwijderen, de bezetting invullen. Puur; elke functie geeft een nieuw object terug.

/** Wat iemand in een getalveld typt, naar een getal; leeg of onzin = null. Een komma telt als decimaalteken. */
export function getalOfNull(tekst: string): number | null {
  const t = tekst.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Een percentage binnen 0 tot 100; null als er niets (bruikbaars) staat. */
export function procentOfNull(tekst: string): number | null {
  const n = getalOfNull(tekst);
  return n === null ? null : Math.min(100, Math.max(0, Math.round(n)));
}

/** Een nieuw id dat nog niet bestaat: voorvoegsel plus het laagste vrije nummer. */
export function volgendeId(voorvoegsel: string, bestaand: readonly { id: string }[]): string {
  const gebruikt = new Set(bestaand.map((x) => x.id));
  for (let n = 1; n < 10_000; n += 1) if (!gebruikt.has(`${voorvoegsel}${n}`)) return `${voorvoegsel}${n}`;
  return `${voorvoegsel}${bestaand.length + 1}`;
}

export function nieuweRuimte(bestaand: readonly { id: string }[]): Ruimte {
  return { id: volgendeId("r", bestaand), naam: "Nieuwe ruimte", soort: "", aantal: 1, m2: null, plekken: null, afdeling: "", verdieping: "", bezetting: legeBezetting(), notitie: "" };
}

export function nieuweGroep(bestaand: readonly { id: string }[]): PersoneelGroep {
  return { id: volgendeId("g", bestaand), naam: "Nieuwe groep", fte: 0, kostenJaar: null };
}

export function wijzigRuimte(b: BedrijfInKaart, id: string, wijziging: Partial<Ruimte>): BedrijfInKaart {
  return { ...b, ruimtes: b.ruimtes.map((r) => (r.id === id ? { ...r, ...wijziging } : r)) };
}

export function wijzigGroep(b: BedrijfInKaart, id: string, wijziging: Partial<PersoneelGroep>): BedrijfInKaart {
  return { ...b, groepen: b.groepen.map((g) => (g.id === id ? { ...g, ...wijziging } : g)) };
}

/** Eén dagdeel van één ruimte instellen; een index buiten het raster verandert niets. */
export function zetBezetting(b: BedrijfInKaart, ruimteId: string, index: number, pct: number | null): BedrijfInKaart {
  if (!Number.isInteger(index) || index < 0 || index >= RASTER_LENGTE) return b;
  return wijzigRuimte(b, ruimteId, { bezetting: (b.ruimtes.find((r) => r.id === ruimteId)?.bezetting ?? legeBezetting()).map((v, i): number | null => (i === index ? pct : v)) });
}

/** Alle OPEN dagdelen van één ruimte op hetzelfde percentage zetten (gesloten dagdelen blijven leeg). */
export function vulOpenDagdelen(b: BedrijfInKaart, ruimteId: string, pct: number): BedrijfInKaart {
  const waarde = Math.min(100, Math.max(0, Math.round(pct)));
  const raster: Raster = b.open.map((open) => (open ? waarde : null));
  return wijzigRuimte(b, ruimteId, { bezetting: raster });
}

/** Het raster van één ruimte naar alle andere ruimtes kopiëren. */
export function kopieerBezettingNaarAlle(b: BedrijfInKaart, ruimteId: string): BedrijfInKaart {
  const bron = b.ruimtes.find((r) => r.id === ruimteId);
  if (!bron) return b;
  return { ...b, ruimtes: b.ruimtes.map((r) => ({ ...r, bezetting: [...bron.bezetting] })) };
}

/** Een dagdeel open of dicht zetten. */
export function zetOpen(b: BedrijfInKaart, index: number, open: boolean): BedrijfInKaart {
  if (!Number.isInteger(index) || index < 0 || index >= RASTER_LENGTE) return b;
  return { ...b, open: b.open.map((o, i) => (i === index ? open : o)) };
}
