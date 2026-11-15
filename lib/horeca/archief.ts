import { hoofdTarief, teBetalenCent } from "@/lib/horeca/bezorgen";

// ---------------------------------------------------------------------------
// Het archief van de bestellingen (15 nov 2026): zoeken op periode, soort,
// kanaal, betaling, bezorger en tekst, en de omzet met btw per tarief. De omzet
// komt hier uit de bestellingen zelf; de bon-administratie voor de boekhouder is
// de kassa (dagafsluiting, lib/horeca/kassa.ts). Puur, ook in de browser.
// ---------------------------------------------------------------------------

export const ARCHIEF_SOORTEN = ["tafel", "afhalen", "bezorgen"] as const;
export const ARCHIEF_BRONNEN = ["qr", "bediening", "kassa", "online"] as const;
export const MAX_DAGEN = 93;
export const MAX_RIJEN = 1000;

export interface ArchiefFilter {
  van: string;
  tot: string;
  soorten: string[];
  bronnen: string[];
  betaald: "alle" | "ja" | "nee";
  geannuleerd: boolean;
  bezorgerId: string | null;
  zoek: string;
}

const isDatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
const dagen = (van: string, tot: string) => Math.round((Date.parse(`${tot}T12:00:00Z`) - Date.parse(`${van}T12:00:00Z`)) / 86_400_000);
const lijstUit = (v: string | null, geldig: readonly string[]) => (v ? v.split(",").filter((x) => geldig.includes(x)) : [...geldig]);

/** De filter uit de adresregel (?van=&tot=&soort=a,b&bron=&betaald=&geannuleerd=1&bezorger=&q=), of een fout. */
export function leesArchiefFilter(q: URLSearchParams): ArchiefFilter | { fout: string } {
  const van = q.get("van") ?? "";
  const tot = q.get("tot") ?? "";
  if (!isDatum(van) || !isDatum(tot) || van > tot) return { fout: "Kies een periode." };
  if (dagen(van, tot) >= MAX_DAGEN) return { fout: `Kies een periode van hooguit ${MAX_DAGEN} dagen.` };
  const betaald = q.get("betaald");
  return {
    van,
    tot,
    soorten: lijstUit(q.get("soort"), ARCHIEF_SOORTEN),
    bronnen: lijstUit(q.get("bron"), ARCHIEF_BRONNEN),
    betaald: betaald === "ja" || betaald === "nee" ? betaald : "alle",
    geannuleerd: q.get("geannuleerd") === "1",
    bezorgerId: q.get("bezorger") || null,
    zoek: (q.get("q") ?? "").trim().slice(0, 60),
  };
}

export interface ArchiefRij {
  id: string;
  nummer: number;
  createdAt: string;
  soort: string;
  bron: string;
  status: string;
  naam: string;
  tafelNaam: string | null;
  adres: string;
  postcode: string;
  plaats: string;
  telefoon: string;
  totaalCent: number;
  kortingCent: number;
  bezorgkostenCent: number;
  betaald: boolean;
  betaalwijze: string;
  bezorgerId: string | null;
  regels: { btw: number; prijsCent: number; aantal: number }[];
}

export interface Samenvatting {
  aantal: number;
  /** wat de klanten betaalden of nog betalen: gerechten min korting plus bezorgkosten */
  omzetCent: number;
  bezorgkostenCent: number;
  perTarief: { btw: number; omzetCent: number; btwCent: number }[];
  perSoort: { soort: string; aantal: number; omzetCent: number }[];
}

/** De btw die in een bedrag inclusief btw zit. */
export const btwIn = (inclCent: number, tarief: number) => Math.round((inclCent * tarief) / (100 + tarief));

/** Omzet en btw van de rijen; geannuleerde bestellingen tellen nooit mee. */
export function omzetEnBtw(rijen: readonly ArchiefRij[]): Samenvatting {
  const tarieven = new Map<number, number>();
  const soorten = new Map<string, { aantal: number; omzetCent: number }>();
  let omzetCent = 0;
  let bezorgkostenCent = 0;
  let aantal = 0;
  for (const r of rijen) {
    if (r.status === "GEANNULEERD") continue;
    aantal += 1;
    const bedrag = teBetalenCent(r);
    omzetCent += bedrag;
    bezorgkostenCent += r.bezorgkostenCent;
    for (const regel of r.regels) tarieven.set(regel.btw, (tarieven.get(regel.btw) ?? 0) + regel.prijsCent * regel.aantal);
    // bezorgkosten volgen de maaltijd (zelfde regel als op de bon, lib/horeca/kassa-server.ts)
    if (r.bezorgkostenCent > 0) {
      const t = hoofdTarief(r.regels);
      tarieven.set(t, (tarieven.get(t) ?? 0) + r.bezorgkostenCent);
    }
    const s = soorten.get(r.soort) ?? { aantal: 0, omzetCent: 0 };
    soorten.set(r.soort, { aantal: s.aantal + 1, omzetCent: s.omzetCent + bedrag });
  }
  return {
    aantal,
    omzetCent,
    bezorgkostenCent,
    perTarief: [...tarieven.entries()].sort((a, b) => b[0] - a[0]).map(([btw, o]) => ({ btw, omzetCent: o, btwCent: btwIn(o, btw) })),
    perSoort: [...soorten.entries()].map(([soort, s]) => ({ soort, ...s })),
  };
}

/** De rijen als CSV voor de boekhouder (puntkomma's, Nederlandse bedragen, BOM voor Excel). */
export function archiefCsv(rijen: readonly ArchiefRij[], tijd: (iso: string) => { datum: string; tijd: string }): string {
  const bedrag = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const veld = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const kop = ["Nummer", "Datum", "Tijd", "Soort", "Kanaal", "Status", "Naam of tafel", "Adres", "Postcode", "Plaats", "Bedrag", "Bezorgkosten", "Betaald", "Betaalwijze"];
  const regels = rijen.map((r) => {
    const t = tijd(r.createdAt);
    return [String(r.nummer), t.datum, t.tijd, r.soort, r.bron, r.status, r.naam || r.tafelNaam || "", r.adres, r.postcode, r.plaats, bedrag(teBetalenCent(r)), bedrag(r.bezorgkostenCent), r.betaald ? "ja" : "nee", r.betaalwijze];
  });
  return `﻿${[kop, ...regels].map((r) => r.map(veld).join(";")).join("\r\n")}`;
}
