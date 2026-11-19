import { PAKKETTEN, type Pakket, type PakketId } from "@/lib/voorstel/smileyapp";

// ---------------------------------------------------------------------------
// Pakketten aanpassen in het beheer van SmileyApp (19 nov 2026). De standaard
// blijft de constante PAKKETTEN in lib/voorstel/smileyapp.ts; het team kan per
// pakket de prijs per maand (of "op aanvraag"), de minimale looptijd, het label
// en de onderdelen overschrijven. Die overschrijvingen zijn gegevens (KV), geen
// code. Dit bestand is puur: controleren, samenvoegen en soepel teruglezen. De
// opslag staat in lib/voorstel/smileyapp-pakketten.ts.
// ---------------------------------------------------------------------------

export const PRIJS_MAX = 100_000;
export const LOOPTIJD_MIN = 1;
export const LOOPTIJD_MAX = 60;
export const ONDERDELEN_MAX = 12;
export const ONDERDEEL_TEKENS = 120;
export const LABEL_TEKENS = 30;

/** Wat er van één pakket is overschreven. Een veld dat ontbreekt, volgt de standaard. */
export interface PakketWijziging {
  /** euro per maand; null = op aanvraag */
  prijs?: number | null;
  /** null = geen minimale looptijd genoemd */
  minimaalMaanden?: number | null;
  label?: string;
  onderdelen?: string[];
}

export type Overschrijvingen = Partial<Record<PakketId, PakketWijziging>>;

/** Wat het formulier in het beheer instuurt: alles als tekst, zoals het is ingetypt. */
export interface PakketInvoer {
  /** "12,50", "12.50" of leeg (= op aanvraag) */
  prijs: string;
  /** "12" of leeg (= geen minimale looptijd) */
  looptijd: string;
  label: string;
  /** één onderdeel per regel */
  onderdelen: string;
}

export type PakketControle = { ok: true; waarde: Required<PakketWijziging> } | { ok: false; veld: keyof PakketInvoer; fout: string };

export const isPakketId = (id: unknown): id is PakketId => typeof id === "string" && PAKKETTEN.some((p) => p.id === id);

/** "1.250,50" of "1250.50" → 1250.5; null als het geen bedrag met hooguit twee decimalen is. */
export function leesBedrag(tekst: string): number | null {
  const t = tekst.trim().replace(/\s/g, "");
  // een punt als duizendtal alleen samen met een komma ("1.250,50") of als groep van drie ("1.250")
  const genormaliseerd = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(genormaliseerd)) return null;
  const n = Number(genormaliseerd);
  return Number.isFinite(n) ? n : null;
}

export function valideerPakket(i: PakketInvoer): PakketControle {
  const fout = (veld: keyof PakketInvoer, tekst: string): PakketControle => ({ ok: false, veld, fout: tekst });

  let prijs: number | null = null;
  if (i.prijs.trim()) {
    prijs = leesBedrag(i.prijs);
    if (prijs === null) return fout("prijs", "Vul een bedrag in met hooguit twee decimalen, of laat het veld leeg voor 'op aanvraag'.");
    if (prijs < 0 || prijs > PRIJS_MAX) return fout("prijs", "De prijs moet tussen 0 en 100.000 liggen.");
  }

  let minimaalMaanden: number | null = null;
  if (i.looptijd.trim()) {
    if (!/^\d{1,2}$/.test(i.looptijd.trim())) return fout("looptijd", `Vul een heel aantal maanden in van ${LOOPTIJD_MIN} tot ${LOOPTIJD_MAX}, of laat het veld leeg.`);
    minimaalMaanden = Number(i.looptijd.trim());
    if (minimaalMaanden < LOOPTIJD_MIN || minimaalMaanden > LOOPTIJD_MAX) return fout("looptijd", `De looptijd moet tussen ${LOOPTIJD_MIN} en ${LOOPTIJD_MAX} maanden liggen.`);
  }

  const label = i.label.replace(/\s+/g, " ").trim();
  if (!label) return fout("label", "Vul een label in, bijvoorbeeld 'Populair'.");
  if (label.length > LABEL_TEKENS) return fout("label", `Het label mag hooguit ${LABEL_TEKENS} tekens zijn.`);

  const onderdelen = i.onderdelen
    .split("\n")
    .map((r) => r.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (onderdelen.length > ONDERDELEN_MAX) return fout("onderdelen", `Hooguit ${ONDERDELEN_MAX} onderdelen (één per regel).`);
  const teLang = onderdelen.find((o) => o.length > ONDERDEEL_TEKENS);
  if (teLang) return fout("onderdelen", `Een onderdeel mag hooguit ${ONDERDEEL_TEKENS} tekens zijn: "${teLang.slice(0, 40)}…" is te lang.`);

  return { ok: true, waarde: { prijs, minimaalMaanden, label, onderdelen } };
}

/**
 * Leest wat er in de opslag staat soepel terug: een onbekend pakket of een veld dat niet (meer) aan de regels
 * voldoet, wordt overgeslagen, zodat een kapotte rij nooit een prijs van de site haalt of een pagina laat omvallen.
 */
export function leesOverschrijvingen(ruw: unknown): Overschrijvingen {
  const uit: Overschrijvingen = {};
  if (!ruw || typeof ruw !== "object") return uit;
  for (const p of PAKKETTEN) {
    if (!Object.hasOwn(ruw, p.id)) continue;
    const r = (ruw as Record<string, unknown>)[p.id];
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const w: PakketWijziging = {};
    if (v.prijs === null) w.prijs = null;
    else if (typeof v.prijs === "number" && Number.isFinite(v.prijs) && v.prijs >= 0 && v.prijs <= PRIJS_MAX) w.prijs = Math.round(v.prijs * 100) / 100;
    if (v.minimaalMaanden === null) w.minimaalMaanden = null;
    else if (typeof v.minimaalMaanden === "number" && Number.isInteger(v.minimaalMaanden) && v.minimaalMaanden >= LOOPTIJD_MIN && v.minimaalMaanden <= LOOPTIJD_MAX) w.minimaalMaanden = v.minimaalMaanden;
    if (typeof v.label === "string" && v.label.trim() && v.label.length <= LABEL_TEKENS) w.label = v.label.trim();
    if (Array.isArray(v.onderdelen)) {
      const lijst = v.onderdelen.filter((o): o is string => typeof o === "string" && !!o.trim() && o.length <= ONDERDEEL_TEKENS).map((o) => o.trim());
      if (lijst.length <= ONDERDELEN_MAX && lijst.length === v.onderdelen.length) w.onderdelen = lijst;
    }
    if (Object.keys(w).length) uit[p.id] = w;
  }
  return uit;
}

/** De pakketten zoals de site ze toont: de standaard met de overschrijvingen eroverheen. Naam, id en uitleg blijven vast. */
export function metOverschrijvingen(o: Overschrijvingen, standaard: readonly Pakket[] = PAKKETTEN): Pakket[] {
  return standaard.map((p) => {
    const w = o[p.id];
    if (!w) return { ...p };
    return {
      ...p,
      ...(w.prijs !== undefined ? { prijs: w.prijs } : {}),
      ...(w.minimaalMaanden !== undefined ? { minimaalMaanden: w.minimaalMaanden } : {}),
      ...(w.label !== undefined ? { label: w.label } : {}),
      ...(w.onderdelen !== undefined ? { onderdelen: w.onderdelen } : {}),
    };
  });
}

/** Wijkt deze wijziging nog af van de standaard? Zo niet, dan hoeft hij niet bewaard te worden. */
export function wijktAf(id: PakketId, w: Required<PakketWijziging>): boolean {
  const p = PAKKETTEN.find((x) => x.id === id);
  if (!p) return false;
  return p.prijs !== w.prijs || p.minimaalMaanden !== w.minimaalMaanden || p.label !== w.label || p.onderdelen.join("\n") !== w.onderdelen.join("\n");
}

/** De waarden van een pakket als tekst voor het formulier (de prijs met een komma). */
export function alsInvoer(p: Pick<Pakket, "prijs" | "minimaalMaanden" | "label" | "onderdelen">): PakketInvoer {
  return {
    prijs: p.prijs === null ? "" : p.prijs.toFixed(2).replace(".", ","),
    looptijd: p.minimaalMaanden === null ? "" : String(p.minimaalMaanden),
    label: p.label,
    onderdelen: p.onderdelen.join("\n"),
  };
}
