import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import { leesRegels } from "@/lib/horeca/bestellen";

// Cijfers voor een horecazaak over een periode: omzet, bestellingen, couverts,
// no-shows, populairste gerechten en de drukste uren. Puur (geen database), zodat
// het met vaste gegevens te testen is; lib/horeca/cijfers-server.ts haalt ze op.
// Alles in Nederlandse tijd (de server draait in UTC).

export interface BestellingIn {
  totaalCent: number;
  status: string;
  createdAt: Date;
  regels: unknown;
  bron: string;
}
export interface ReserveringIn {
  datum: string; // JJJJ-MM-DD
  tijd: string; // UU:MM
  personen: number;
  status: string;
  bron: string;
}

export interface Dag {
  datum: string;
  omzetCent: number;
  bestellingen: number;
  couverts: number;
  noShows: number;
}
export interface Cijfers {
  van: string;
  tot: string;
  dagen: Dag[];
  totaal: {
    omzetCent: number;
    bestellingen: number;
    gemiddeldeBonCent: number;
    couverts: number;
    reserveringen: number;
    noShows: number;
    /** aandeel no-shows van de reserveringen die al voorbij zijn, 0–100 */
    noShowProcent: number;
    /** aandeel van de bestellingen dat de gast zelf deed (QR-code), 0–100 */
    zelfBesteldProcent: number;
    /** aandeel van de reserveringen dat online binnenkwam, 0–100 */
    onlineGereserveerdProcent: number;
  };
  topGerechten: { naam: string; aantal: number; omzetCent: number }[];
  /** bestellingen per uur van de dag (0–23), Nederlandse tijd */
  perUur: number[];
}

/** De dagen van `van` t/m `tot` (JJJJ-MM-DD), oplopend. */
export function dagenTussen(van: string, tot: string): string[] {
  const uit: string[] = [];
  const [y, m, d] = van.split("-").map(Number);
  if (!y || !m || !d) return uit;
  for (let i = 0; i < 400; i++) {
    const k = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (k > tot) break;
    uit.push(k);
  }
  return uit;
}

const procent = (deel: number, geheel: number) => (geheel > 0 ? Math.round((deel / geheel) * 100) : 0);

/**
 * Rekent de cijfers uit. `vandaag` (JJJJ-MM-DD) bepaalt welke reserveringen
 * "voorbij" zijn voor het no-showpercentage. Geannuleerde bestellingen en
 * reserveringen tellen nergens mee.
 */
export function berekenCijfers(van: string, tot: string, vandaag: string, bestellingen: BestellingIn[], reserveringen: ReserveringIn[]): Cijfers {
  const dagen = new Map<string, Dag>(dagenTussen(van, tot).map((d) => [d, { datum: d, omzetCent: 0, bestellingen: 0, couverts: 0, noShows: 0 }]));
  const perUur = Array.from({ length: 24 }, () => 0);
  const gerechten = new Map<string, { naam: string; aantal: number; omzetCent: number }>();
  let zelf = 0;
  let telBest = 0;

  for (const b of bestellingen) {
    if (b.status === "GEANNULEERD") continue;
    const dag = dagen.get(amsterdamDayKey(b.createdAt));
    if (!dag) continue;
    dag.omzetCent += b.totaalCent;
    dag.bestellingen += 1;
    telBest += 1;
    if (b.bron === "qr") zelf += 1;
    const uur = amsterdamParts(b.createdAt).hour;
    perUur[uur] = (perUur[uur] ?? 0) + 1;
    for (const r of leesRegels(b.regels)) {
      const sleutel = r.itemId || r.naam;
      const g = gerechten.get(sleutel) ?? { naam: r.naam, aantal: 0, omzetCent: 0 };
      g.aantal += r.aantal;
      g.omzetCent += r.aantal * r.prijsCent;
      gerechten.set(sleutel, g);
    }
  }

  let reserveringenTeld = 0;
  let voorbij = 0;
  let noShowsVoorbij = 0;
  let online = 0;
  for (const r of reserveringen) {
    if (r.status === "GEANNULEERD") continue;
    const dag = dagen.get(r.datum);
    if (!dag) continue;
    reserveringenTeld += 1;
    if (r.bron === "online") online += 1;
    if (r.status === "NIET_GEKOMEN") dag.noShows += 1;
    else dag.couverts += r.personen;
    if (r.datum < vandaag) {
      voorbij += 1;
      if (r.status === "NIET_GEKOMEN") noShowsVoorbij += 1;
    }
  }

  const lijst = [...dagen.values()];
  const omzetCent = lijst.reduce((s, d) => s + d.omzetCent, 0);
  return {
    van,
    tot,
    dagen: lijst,
    totaal: {
      omzetCent,
      bestellingen: telBest,
      gemiddeldeBonCent: telBest ? Math.round(omzetCent / telBest) : 0,
      couverts: lijst.reduce((s, d) => s + d.couverts, 0),
      reserveringen: reserveringenTeld,
      noShows: lijst.reduce((s, d) => s + d.noShows, 0),
      noShowProcent: procent(noShowsVoorbij, voorbij),
      zelfBesteldProcent: procent(zelf, telBest),
      onlineGereserveerdProcent: procent(online, reserveringenTeld),
    },
    topGerechten: [...gerechten.values()].sort((a, b) => b.aantal - a.aantal || b.omzetCent - a.omzetCent).slice(0, 5),
    perUur,
  };
}
