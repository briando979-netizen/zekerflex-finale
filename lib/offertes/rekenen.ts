// ---------------------------------------------------------------------------
// Het rekenwerk van een offerte: puur, zonder database, ook veilig in de browser. Geld is altijd een geheel aantal
// centen, exclusief btw; er komt nooit een float in een bedrag.
//
// De afrondingsregel (vast, en getest):
//   1. Een regel = aantal × prijs per eenheid. Het aantal heeft hoogstens 3 decimalen (we rekenen in duizendsten),
//      het regelbedrag wordt EENMAAL afgerond op hele centen, halven omhoog ("half-up").
//   2. Per btw-tarief (0, 9, 21) is het subtotaal de som van de regelbedragen.
//   3. De korting (percentage over het geheel, in honderdsten van een procent) wordt PER TARIEF berekend en
//      afgerond op hele centen; de totale korting is de som van die bedragen. Zo verdelen we de korting eerlijk over
//      de tarieven en blijft elk tarief op de cent kloppen.
//   4. De btw per tarief = (subtotaal - korting) × tarief, afgerond op hele centen per tarief (half-up).
//   5. Totaal incl. btw = som van (netto per tarief + btw per tarief). Het totaal is dus altijd de som van de delen.
// De berekening met grote getallen gaat via BigInt, zodat ook een heel groot aantal niet stil afrondt.
// ---------------------------------------------------------------------------

export const BTW_TARIEVEN = [0, 9, 21] as const;
export type BtwTarief = (typeof BTW_TARIEVEN)[number];

export interface RekenRegel {
  /** aantal, hoogstens 3 decimalen */
  aantal: number;
  /** prijs per eenheid in centen, exclusief btw */
  prijsCent: number;
  btw: number;
}

export interface TariefTotaal {
  btw: number;
  subtotaalCent: number;
  kortingCent: number;
  nettoCent: number;
  btwCent: number;
}

export interface OfferteTotalen {
  /** het bedrag per regel (aantal × prijs, afgerond), in dezelfde volgorde als de invoer */
  regelCent: number[];
  /** per gebruikt tarief, oplopend */
  tarieven: TariefTotaal[];
  subtotaalCent: number;
  kortingCent: number;
  nettoCent: number;
  btwCent: number;
  totaalCent: number;
}

/** Het aantal in duizendsten (0,333 → 333). */
export const aantalMilli = (aantal: number): number => Math.round(aantal * 1000);

/** a × b / c, afgerond op een geheel getal (halven omhoog), met BigInt voor de tussenstap. Alleen voor a, b ≥ 0 en c > 0. */
export function maalDeelAf(a: number, b: number, c: number): number {
  const noemer = BigInt(c);
  const teller = BigInt(a) * BigInt(b);
  return Number((teller * 2n + noemer) / (noemer * 2n));
}

export const regelBedragCent = (r: Pick<RekenRegel, "aantal" | "prijsCent">): number => maalDeelAf(aantalMilli(r.aantal), r.prijsCent, 1000);

export function berekenTotalen(regels: RekenRegel[], kortingBp = 0): OfferteTotalen {
  const regelCent = regels.map(regelBedragCent);
  const perTarief = new Map<number, number>();
  regels.forEach((r, n) => perTarief.set(r.btw, (perTarief.get(r.btw) ?? 0) + (regelCent[n] ?? 0)));
  const bp = Math.min(10_000, Math.max(0, Math.round(kortingBp)));
  const tarieven: TariefTotaal[] = [...perTarief.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([btw, subtotaalCent]) => {
      const kortingCent = Math.min(subtotaalCent, maalDeelAf(subtotaalCent, bp, 10_000));
      const nettoCent = subtotaalCent - kortingCent;
      return { btw, subtotaalCent, kortingCent, nettoCent, btwCent: maalDeelAf(nettoCent, btw, 100) };
    });
  const som = (f: (t: TariefTotaal) => number) => tarieven.reduce((s, t) => s + f(t), 0);
  const nettoCent = som((t) => t.nettoCent);
  const btwCent = som((t) => t.btwCent);
  return { regelCent, tarieven, subtotaalCent: som((t) => t.subtotaalCent), kortingCent: som((t) => t.kortingCent), nettoCent, btwCent, totaalCent: nettoCent + btwCent };
}

// --- invoer en weergave van bedragen en aantallen ------------------------------

/** "€ 1.234,56" (altijd twee decimalen, punt als duizendtal); een negatief bedrag krijgt een min. */
export function euro(cent: number): string {
  const neg = cent < 0;
  const abs = Math.abs(Math.round(cent));
  const hele = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}€ ${hele},${String(abs % 100).padStart(2, "0")}`;
}

/** Een bedrag uit een invoerveld ("12,50", "12.5", "1.250,00", "€ 12") naar centen; null bij onzin of meer dan 2 decimalen. */
export function centUitTekst(tekst: string): number | null {
  let t = tekst.replace(/[€\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

/** Een aantal uit een invoerveld ("2,5", "0.333") naar een getal met hoogstens 3 decimalen; null bij onzin. */
export function aantalUitTekst(tekst: string): number | null {
  const t = tekst.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  return Number(t);
}

/** Een aantal netjes met een komma ("2,5"), zonder overbodige nullen. */
export const aantalTekst = (aantal: number): string => String(aantal).replace(".", ",");

/** Een kortingspercentage uit honderdsten ("1250" → "12,5"). */
export const procentTekst = (bp: number): string => String(bp / 100).replace(".", ",");
