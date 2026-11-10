import type { BtwInstelling, BtwTarief, SiteProduct, Winkel } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Btw in de winkel van een klantsite. Een winkel zonder instelling krijgt geen
// btw-regels (dan verzinnen we geen tarief). Met een instelling: per product
// 21, 9 of 0 procent (of het standaardtarief van de winkel), prijzen inclusief
// btw (standaard) of exclusief, of geen btw onder de kleineondernemersregeling.
// De korting gaat naar verhouding van de regels af; de verzendkosten volgen
// de producten naar verhouding van hun bedrag per tarief (zoals de
// Belastingdienst het toestaat). Afronden per tarief, op de hele bestelling.
// Puur en client-veilig.
// ---------------------------------------------------------------------------

export const STANDAARD_BTW: BtwInstelling = { inclusief: true, standaard: 21, kor: false };

/** De btw-instelling van de winkel, of null als die er (nog) niet is. */
export const btwInstellingVan = (w: Pick<Winkel, "btw">): BtwInstelling | null => w.btw ?? null;

/** Prijzen exclusief btw: de btw komt er bij het afrekenen bij (niet onder de KOR). */
export const prijzenExclBtw = (w: Pick<Winkel, "btw">): boolean => Boolean(w.btw && !w.btw.kor && !w.btw.inclusief);

/** Het tarief van een product: zijn eigen, of het standaardtarief van de winkel. */
export const tariefVan = (p: Pick<SiteProduct, "btw">, s: Pick<BtwInstelling, "standaard">): BtwTarief => p.btw ?? s.standaard;

/**
 * Een bedrag in hele centen naar verhouding verdelen over `delen`, zonder dat er een cent zoekraakt
 * of bijkomt (grootste rest eerst; bij gelijke rest het eerste deel). Zijn alle delen 0, dan krijgt niemand iets.
 */
export function verdeel(delen: number[], totaal: number): number[] {
  const som = delen.reduce((a, b) => a + Math.max(0, b), 0);
  if (som <= 0 || totaal <= 0) return delen.map(() => 0);
  const uit = delen.map((d) => Math.floor((Math.max(0, d) * totaal) / som));
  let rest = totaal - uit.reduce((a, b) => a + b, 0);
  const volgorde = delen.map((d, i) => ({ i, r: (Math.max(0, d) * totaal) % som })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of volgorde) {
    if (rest <= 0) break;
    uit[i] = (uit[i] ?? 0) + 1;
    rest--;
  }
  return uit;
}

export interface BtwRegel {
  /** 21, 9 of 0 */
  tarief: number;
  /** het bedrag zonder btw */
  grondslagCents: number;
  btwCents: number;
}

/** De btw van een bestelling, zoals hij bij de bestelling bewaard wordt. */
export interface BtwOverzicht {
  /** de bedragen van de bestelling zijn inclusief btw; uit = de btw komt erbij */
  inclusief: boolean;
  /** kleineondernemersregeling: geen btw */
  kor: boolean;
  /** per tarief, hoogste eerst */
  regels: BtwRegel[];
  totaalCents: number;
}

/** Het btw-bedrag in een bedrag: inclusief 121 bij 21% geeft 21, exclusief 100 bij 21% geeft 21. */
export function btwIn(cents: number, tarief: number, inclusief: boolean): number {
  if (tarief <= 0 || cents <= 0) return 0;
  return Math.round(inclusief ? (cents * tarief) / (100 + tarief) : (cents * tarief) / 100);
}

/**
 * De btw van een bestelling. `posten`: per bestelregel het bedrag na korting en het tarief, zoals de
 * winkel rekent (inclusief of exclusief); `verzendCents`: de verzendkosten. Zonder producten met een
 * bedrag vallen de verzendkosten onder het standaardtarief.
 */
export function btwOverzicht(s: BtwInstelling, posten: { cents: number; tarief: number }[], verzendCents: number): BtwOverzicht {
  if (s.kor) return { inclusief: true, kor: true, regels: [], totaalCents: 0 };
  const per = new Map<number, number>();
  for (const p of posten) if (p.cents > 0) per.set(p.tarief, (per.get(p.tarief) ?? 0) + p.cents);
  if (verzendCents > 0) {
    const tarieven = [...per.keys()];
    if (!tarieven.length) per.set(s.standaard, verzendCents);
    const delen = verdeel(
      tarieven.map((t) => per.get(t) ?? 0),
      verzendCents,
    );
    tarieven.forEach((t, i) => per.set(t, (per.get(t) ?? 0) + (delen[i] ?? 0)));
  }
  const regels = [...per.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([tarief, cents]) => {
      const btwCents = btwIn(cents, tarief, s.inclusief);
      return { tarief, grondslagCents: s.inclusief ? cents - btwCents : cents, btwCents };
    });
  return { inclusief: s.inclusief, kor: false, regels, totaalCents: regels.reduce((a, r) => a + r.btwCents, 0) };
}

/** "Btw 21%" of, bij prijzen inclusief btw, "Waarvan btw 21%". */
export const btwLabel = (r: Pick<BtwRegel, "tarief">, inclusief: boolean): string => `${inclusief ? "Waarvan btw" : "Btw"} ${r.tarief}%`;

export const KOR_TEKST = "Geen btw: deze winkel valt onder de kleineondernemersregeling.";
