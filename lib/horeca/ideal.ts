import type { BestelRegel } from "@/lib/horeca/bestellen";
import { betaalRegels, isBtw, STANDAARD_BTW, type BonRegel, type RekeningRegel, type Selectie } from "@/lib/horeca/kassa";

// ---------------------------------------------------------------------------
// Afrekenen aan tafel met iDEAL: de pure delen (de server staat in
// lib/horeca/betalen.ts). Bij het starten legt de server vast wat er betaald
// wordt: de open regels van de tafel, met prijs en btw. Pas als Stripe meldt
// dat het geld binnen is, worden die regels afgeboekt en krijgt de betaling een
// bonnummer. Rekende de bediening intussen al af, dan is het geld toch binnen:
// de betaling wordt vastgelegd met een melding om de gast terug te betalen.
// ---------------------------------------------------------------------------

/** Een regel van een iDEAL-betaling: wat er op de bon komt, plus welke bestelregel hij afboekt. */
export interface IdealRegel extends BonRegel {
  bestellingId: string;
  index: number;
}

export const MAX_FOOI_CENT = 10_000;

/** Fooi die de gast zelf kiest: hele centen, niet negatief, hooguit € 100 en hooguit het bedrag van de rekening. */
export const fooiGeldig = (fooiCent: unknown, totaalCent: number): fooiCent is number =>
  typeof fooiCent === "number" && Number.isInteger(fooiCent) && fooiCent >= 0 && fooiCent <= Math.min(MAX_FOOI_CENT, totaalCent);

/** De open rekening van een tafel als regels van één iDEAL-betaling. */
export const idealRegels = (rekening: readonly RekeningRegel[]): IdealRegel[] =>
  rekening.map((r) => ({ naam: r.naam, prijsCent: r.prijsCent, aantal: r.aantal, btw: r.btw, bestellingId: r.bestellingId, index: r.index }));

/** De vastgelegde regels terug uit de database (Json); een onbruikbare regel valt weg. */
export function leesIdealRegels(json: unknown): IdealRegel[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x: unknown) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const ok =
      typeof r.naam === "string" &&
      typeof r.bestellingId === "string" &&
      Number.isInteger(r.index) &&
      Number.isInteger(r.prijsCent) &&
      Number.isInteger(r.aantal) &&
      (r.aantal as number) > 0;
    if (!ok) return [];
    return [{ naam: r.naam as string, prijsCent: r.prijsCent as number, aantal: r.aantal as number, btw: isBtw(r.btw) ? r.btw : STANDAARD_BTW, bestellingId: r.bestellingId as string, index: r.index as number }];
  });
}

/**
 * Wat er nog te kiezen is: de open rekening min wat een andere gast aan tafel
 * op dit moment al aan het betalen is (een lopende iDEAL-betaling). Zo kunnen
 * twee gasten niet tegelijk hetzelfde gerecht afrekenen.
 */
export function beschikbaar(rekening: readonly RekeningRegel[], inBetaling: readonly IdealRegel[]): RekeningRegel[] {
  const bezet = new Map<string, number>();
  for (const r of inBetaling) bezet.set(`${r.bestellingId}:${r.index}`, (bezet.get(`${r.bestellingId}:${r.index}`) ?? 0) + r.aantal);
  return rekening.flatMap((r) => {
    const over = r.aantal - (bezet.get(`${r.bestellingId}:${r.index}`) ?? 0);
    return over > 0 ? [{ ...r, aantal: over }] : [];
  });
}

/**
 * De keuze van een gast ("alleen wat ik had") als regels voor één betaling.
 * Dubbele keuzes worden opgeteld; meer kiezen dan er open staat, of iets wat
 * niet (meer) op de rekening staat, is een fout.
 */
export function kiesRegels(open: readonly RekeningRegel[], selectie: readonly Selectie[]): IdealRegel[] | { fout: string } {
  const per = new Map<string, number>();
  for (const s of selectie) {
    if (!Number.isInteger(s.aantal) || s.aantal < 1) return { fout: "Kies hoeveel je van elk gerecht betaalt." };
    per.set(`${s.bestellingId}:${s.index}`, (per.get(`${s.bestellingId}:${s.index}`) ?? 0) + s.aantal);
  }
  if (!per.size) return { fout: "Kies wat je wilt betalen." };
  const uit: IdealRegel[] = [];
  for (const [sleutel, aantal] of per) {
    const r = open.find((x) => `${x.bestellingId}:${x.index}` === sleutel);
    if (!r) return { fout: "Een gerecht staat niet meer open. Ververs de rekening." };
    if (aantal > r.aantal) return { fout: `Van ${r.naam} staat nog ${r.aantal} open.` };
    uit.push({ naam: r.naam, prijsCent: r.prijsCent, aantal, btw: r.btw, bestellingId: r.bestellingId, index: r.index });
  }
  return uit;
}

/** Alleen wat op de bon hoort (naam, prijs, aantal, btw). */
export const bonRegels = (regels: readonly IdealRegel[]): BonRegel[] => regels.map(({ naam, prijsCent, aantal, btw }) => ({ naam, prijsCent, aantal, btw }));

export interface AfTeBoeken {
  id: string;
  status: string;
  betaald: boolean;
  regels: BestelRegel[];
}

/**
 * Boek de betaalde regels af in de bestellingen. Staat er iets niet meer open
 * (afgerekend aan de kassa, geannuleerd of verdwenen), dan boekt er niets af:
 * dan klopt de rekening niet meer en moet een mens kijken.
 */
export function boekAf(
  bestellingen: readonly AfTeBoeken[],
  regels: readonly IdealRegel[],
): { ok: true; wijzigingen: { id: string; regels: BestelRegel[]; helemaal: boolean }[] } | { ok: false; fout: string } {
  if (!regels.length) return { ok: false, fout: "Op deze betaling staan geen regels." };
  const per = new Map<string, Omit<Selectie, "bestellingId">[]>();
  for (const r of regels) per.set(r.bestellingId, [...(per.get(r.bestellingId) ?? []), { index: r.index, aantal: r.aantal }]);
  const wijzigingen: { id: string; regels: BestelRegel[]; helemaal: boolean }[] = [];
  for (const [id, selectie] of per) {
    const b = bestellingen.find((x) => x.id === id);
    if (!b) return { ok: false, fout: "Een bestelling van deze rekening bestaat niet meer." };
    if (b.betaald) return { ok: false, fout: "Deze rekening was intussen al afgerekend." };
    if (b.status === "GEANNULEERD") return { ok: false, fout: "Een bestelling van deze rekening is geannuleerd." };
    const uit = betaalRegels(b.regels, selectie);
    if ("fout" in uit) return { ok: false, fout: uit.fout };
    wijzigingen.push({ id, ...uit });
  }
  return { ok: true, wijzigingen };
}
