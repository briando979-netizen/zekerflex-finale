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
