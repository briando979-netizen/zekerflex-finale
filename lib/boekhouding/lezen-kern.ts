// ---------------------------------------------------------------------------
// Boekhouding: de rekenkern van de leesfuncties (puur, zonder prisma). lezen.ts haalt de rijen op en geeft ze hieraan.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";

export type RekeningKant = "BALANS" | "WV";

export interface ProefbalansRij {
  rekeningNummer: string;
  rgsCode?: string;
  naam: string;
  kant: RekeningKant;
  debetCents: number;
  creditCents: number;
}

export interface RekeningRij {
  id: string;
  nummer: string;
  rgsCode: string | null;
  naam: string;
  soort: string;
}

export interface RekeningSom {
  rekeningId: string;
  debetCents: number;
  creditCents: number;
}

/** ACTIVA en PASSIVA staan op de balans, OMZET en KOSTEN in de winst-en-verliesrekening. */
export function kantVan(soort: string): RekeningKant {
  return soort === "ACTIVA" || soort === "PASSIVA" ? "BALANS" : "WV";
}

/** Een proefbalans: alleen rekeningen met beweging in de periode, op rekeningnummer. */
export function proefbalansRijen(rekeningen: readonly RekeningRij[], sommen: readonly RekeningSom[]): ProefbalansRij[] {
  const perRekening = new Map(rekeningen.map((r) => [r.id, r] as const));
  const rijen: ProefbalansRij[] = [];
  for (const s of sommen) {
    const r = perRekening.get(s.rekeningId);
    if (!r) continue;
    if (s.debetCents === 0 && s.creditCents === 0) continue;
    rijen.push({
      rekeningNummer: r.nummer,
      ...(r.rgsCode ? { rgsCode: r.rgsCode } : {}),
      naam: r.naam,
      kant: kantVan(r.soort),
      debetCents: s.debetCents,
      creditCents: s.creditCents,
    });
  }
  return rijen.sort((a, b) => a.rekeningNummer.localeCompare(b.rekeningNummer, "nl", { numeric: true }));
}

export interface PostRegel {
  postSleutel: string;
  rekeningNummer: string;
  rekeningSoort: string;
  debetCents: number;
  creditCents: number;
  /** boekdag "2026-04-10" */
  datum: string;
}

export interface OpenPost {
  postSleutel: string;
  rekeningNummer: string;
  saldoCents: number;
  oudsteDatum: string;
  soort: "DEBITEUR" | "CREDITEUR";
}

/**
 * Open posten per (sleutel, rekening) op de peildatum (inclusief). Een debiteur (ACTIVA) is open met een debetsaldo,
 * een crediteur (PASSIVA) met een creditsaldo; saldo 0 is gesloten en staat er niet in. Regels na de peildatum tellen niet.
 */
export function openPostenUit(regels: readonly PostRegel[], peildatum: string): OpenPost[] {
  const groepen = new Map<string, { post: PostRegel; saldo: number; oudste: string }>();
  for (const r of regels) {
    if (r.datum > peildatum) continue;
    if (r.rekeningSoort !== "ACTIVA" && r.rekeningSoort !== "PASSIVA") continue;
    const sleutel = `${r.postSleutel}\u0000${r.rekeningNummer}`;
    const delta = r.rekeningSoort === "ACTIVA" ? r.debetCents - r.creditCents : r.creditCents - r.debetCents;
    const groep = groepen.get(sleutel);
    if (groep) {
      groep.saldo += delta;
      if (r.datum < groep.oudste) groep.oudste = r.datum;
    } else {
      groepen.set(sleutel, { post: r, saldo: delta, oudste: r.datum });
    }
  }
  return [...groepen.values()]
    .filter((g) => g.saldo !== 0)
    .map((g) => ({
      postSleutel: g.post.postSleutel,
      rekeningNummer: g.post.rekeningNummer,
      saldoCents: g.saldo,
      oudsteDatum: g.oudste,
      soort: g.post.rekeningSoort === "ACTIVA" ? ("DEBITEUR" as const) : ("CREDITEUR" as const),
    }))
    .sort((a, b) => a.oudsteDatum.localeCompare(b.oudsteDatum) || a.postSleutel.localeCompare(b.postSleutel));
}

export interface BtwRegel {
  debetCents: number;
  creditCents: number;
  isBtwRegel: boolean;
  btwBasisCents: number | null;
  richting: "VERKOOP" | "INKOOP";
  grondslagRubriek: string | null;
  btwRubriek: string | null;
}

export interface BtwRubriekRij {
  rubriek: string;
  grondslagCents: number;
  btwCents: number;
}

export interface BtwOverzicht {
  rubrieken: BtwRubriekRij[];
  /** verschuldigde btw min voorbelasting uit de boekregels met btw-code (positief = te betalen) */
  geboektSaldoCents: number;
  /** de indeling in rubrieken is nog niet door een accountant bevestigd */
  rubriekBevestigd: false;
  opmerking: string;
}

export const BTW_OPMERKING = "De rubriekindeling is door accountant te bevestigen; dit is een berekening uit de boekregels, geen aangifte.";

/**
 * Grondslag en btw per rubriek uit de boekregels met een btw-code. Het teken volgt de kant van de regel, dus een
 * tegenboeking (omgekeerde kanten) haalt een eerdere boeking weer weg. Verkoop-btw telt positief, voorbelasting
 * (inkoop) in het saldo negatief; in de rubrieken staat de btw van beide als positief bedrag.
 */
export function btwOverzichtUit(regels: readonly BtwRegel[]): BtwOverzicht {
  const rubrieken = new Map<string, BtwRubriekRij>();
  const rij = (naam: string): BtwRubriekRij => {
    let r = rubrieken.get(naam);
    if (!r) {
      r = { rubriek: naam, grondslagCents: 0, btwCents: 0 };
      rubrieken.set(naam, r);
    }
    return r;
  };
  let saldo = 0;
  for (const r of regels) {
    const verkoop = r.richting === "VERKOOP";
    // verkoop: credit = plus; inkoop: debet = plus
    const netto = verkoop ? r.creditCents - r.debetCents : r.debetCents - r.creditCents;
    if (r.isBtwRegel) {
      saldo += verkoop ? netto : -netto;
      if (r.btwRubriek) rij(r.btwRubriek).btwCents += netto;
    } else if (r.btwBasisCents !== null && r.grondslagRubriek) {
      const teken = netto >= 0 ? 1 : -1;
      rij(r.grondslagRubriek).grondslagCents += teken * r.btwBasisCents;
    }
  }
  return {
    rubrieken: [...rubrieken.values()].sort((a, b) => a.rubriek.localeCompare(b.rubriek, "nl", { numeric: true })),
    geboektSaldoCents: saldo,
    rubriekBevestigd: false,
    opmerking: BTW_OPMERKING,
  };
}

/** Eerste en laatste boekdag van een kwartaal, "2026-01-01" t/m "2026-03-31". */
export function kwartaalGrenzen(jaar: number, kwartaal: number): { van: string; tot: string } {
  if (!Number.isInteger(jaar) || jaar < 2000 || jaar > 2100) throw AppError.validation("Het jaar is geen geldig jaar.");
  if (!Number.isInteger(kwartaal) || kwartaal < 1 || kwartaal > 4) throw AppError.validation("Een kwartaal is 1, 2, 3 of 4.");
  const eersteMaand = (kwartaal - 1) * 3 + 1;
  const laatsteMaand = eersteMaand + 2;
  const laatsteDag = new Date(Date.UTC(jaar, laatsteMaand, 0)).getUTCDate();
  const mm = (n: number) => String(n).padStart(2, "0");
  return { van: `${jaar}-${mm(eersteMaand)}-01`, tot: `${jaar}-${mm(laatsteMaand)}-${mm(laatsteDag)}` };
}

/** De boekdag van een @db.Date-waarde (middernacht UTC): "2026-04-10". */
export function dagVanDatumKolom(d: Date): string {
  return d.toISOString().slice(0, 10);
}
