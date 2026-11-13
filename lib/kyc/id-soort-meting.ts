import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import type { MrzUitslag } from "@/lib/kyc/mrz";

// Een geteld totaal per maand, los van de gebruiker (13 nov 2026, 86): hoeveel eigen ID-scans een Nederlands paspoort of
// ID-kaart van model 2021+ waren. Bij die documenten staat het BSN niet meer in de MRZ maar alleen in een QR-code (bij
// het paspoort op een pagina die we niet fotograferen). Over een maand beslissen we daarmee of een extra foto zin heeft.
// Geen userId, geen tijdstip per scan, geen nummer of land per persoon: geen persoonsgegeven, dus niet in
// ERASABLE_KV_PREFIXES.

export type IdSoortTeller = "nld_paspoort_2021" | "nld_idkaart_2021" | "overig";
export interface IdSoortTelling {
  nld_paspoort_2021: number;
  nld_idkaart_2021: number;
  overig: number;
}

/** Vanaf deze vervaldatum is een document van 10 jaar uitgegeven na 2 aug 2021 (model 2021; bron RvIG). */
const MODEL_2021_VERVAL = "2031-08-02";

export function idSoortTeller(mrz: Pick<MrzUitslag, "land" | "soort" | "vervaldatum">): IdSoortTeller {
  const nieuw = mrz.land === "NLD" && Boolean(mrz.vervaldatum && mrz.vervaldatum >= MODEL_2021_VERVAL);
  if (nieuw && mrz.soort === "PASSPORT") return "nld_paspoort_2021";
  if (nieuw && mrz.soort === "ID_CARD") return "nld_idkaart_2021";
  return "overig";
}

export const idSoortSleutel = (nu: Date) => `meting:id-soort:${amsterdamDayKey(nu).slice(0, 7)}`;

/** Telt één eigen scan met een geldige MRZ. Een storing telt niet, en houdt niets tegen. */
export async function telIdSoort(mrz: Pick<MrzUitslag, "land" | "soort" | "vervaldatum">, nu: Date = new Date()): Promise<void> {
  const sleutel = idSoortSleutel(nu);
  const oud = (await kvGet<Partial<IdSoortTelling>>(sleutel)) ?? {};
  const t: IdSoortTelling = { nld_paspoort_2021: oud.nld_paspoort_2021 ?? 0, nld_idkaart_2021: oud.nld_idkaart_2021 ?? 0, overig: oud.overig ?? 0 };
  t[idSoortTeller(mrz)] += 1;
  await kvSet(sleutel, t);
}

// Ook een totaal per maand voor het BSN-voorstel uit de QR-code (13 nov 2026): lukte het lezen, en hoe lang duurde het
// (in klassen). Het lezen loopt na het antwoord van de scan (lib/onboarding/verify.ts); wie meteen op "Verder: gegevens"
// klikt, kan er eerder zijn dan het voorstel. Met deze telling en de klikken weten we of dat echt gebeurt. Geen userId,
// geen nummer, geen tijdstip per scan: geen persoonsgegeven.

export interface BsnQrTelling {
  gelezen: number;
  niet_gelezen: number;
  onder_2s: number;
  tot_5s: number;
  boven_5s: number;
}

export type BsnQrDuur = "onder_2s" | "tot_5s" | "boven_5s";

export function bsnQrDuurKlasse(ms: number): BsnQrDuur {
  return ms < 2000 ? "onder_2s" : ms <= 5000 ? "tot_5s" : "boven_5s";
}

export const bsnQrSleutel = (nu: Date) => `meting:bsn-qr:${amsterdamDayKey(nu).slice(0, 7)}`;

/** Telt één poging om het BSN uit de QR te lezen. Een storing telt niet, en houdt niets tegen. */
export async function telBsnQr(gelezen: boolean, ms: number, nu: Date = new Date()): Promise<void> {
  const sleutel = bsnQrSleutel(nu);
  const oud = (await kvGet<Partial<BsnQrTelling>>(sleutel)) ?? {};
  const t: BsnQrTelling = {
    gelezen: oud.gelezen ?? 0,
    niet_gelezen: oud.niet_gelezen ?? 0,
    onder_2s: oud.onder_2s ?? 0,
    tot_5s: oud.tot_5s ?? 0,
    boven_5s: oud.boven_5s ?? 0,
  };
  t[gelezen ? "gelezen" : "niet_gelezen"] += 1;
  t[bsnQrDuurKlasse(ms)] += 1;
  await kvSet(sleutel, t);
}
