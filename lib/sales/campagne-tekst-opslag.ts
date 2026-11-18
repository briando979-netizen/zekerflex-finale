import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import type { CampagneTekst, CampagneTekstInvoer } from "@/lib/sales/campagne-tekst";

// ---------------------------------------------------------------------------
// Opslag van de vaste tekst per campagne (lib/sales/campagne-tekst.ts), in de KV:
//   sales:campagne-tekst:<campaignId> → CampagneTekst
// Per campagne, niet per gebruiker: er staan geen persoonsgegevens van een klant in (alleen het adres van de beheerder
// die hem bewaarde). Lezen faalt nooit: bij een storing of een kapotte rij is er "geen vaste tekst".
// ---------------------------------------------------------------------------

const sleutel = (campaignId: string): string => `sales:campagne-tekst:${campaignId}`;

const tekstVan = (v: unknown): string => (typeof v === "string" ? v : "");

/** De vaste tekst van een campagne; null als er geen is (of als de KV even niet antwoordt). */
export async function leesCampagneTekst(campaignId: string): Promise<CampagneTekst | null> {
  try {
    const ruw = await kvGet<Partial<CampagneTekst>>(sleutel(campaignId));
    if (!ruw || typeof ruw !== "object") return null;
    const onderwerp = tekstVan(ruw.onderwerp).trim();
    const tekst = tekstVan(ruw.tekst).trim();
    if (!onderwerp || !tekst) return null;
    const knopTekst = tekstVan(ruw.knopTekst).trim();
    const knopUrl = tekstVan(ruw.knopUrl).trim();
    return {
      onderwerp,
      tekst,
      ...(knopTekst ? { knopTekst } : {}),
      ...(knopUrl ? { knopUrl } : {}),
      zonderVacature: ruw.zonderVacature === true,
      bijgewerkt: tekstVan(ruw.bijgewerkt),
      door: tekstVan(ruw.door),
    };
  } catch {
    return null;
  }
}

/** Bewaart de tekst (de route heeft hem al gecontroleerd met beoordeelCampagneTekst) en geeft terug wat er nu staat. */
export async function bewaarCampagneTekst(campaignId: string, invoer: CampagneTekstInvoer, door: string, nu: Date = new Date()): Promise<CampagneTekst> {
  const knopTekst = (invoer.knopTekst ?? "").trim();
  const knopUrl = (invoer.knopUrl ?? "").trim();
  const tekst: CampagneTekst = {
    onderwerp: invoer.onderwerp.trim(),
    tekst: invoer.tekst.trim(),
    ...(knopTekst ? { knopTekst } : {}),
    ...(knopUrl ? { knopUrl } : {}),
    zonderVacature: invoer.zonderVacature === true,
    bijgewerkt: nu.toISOString(),
    door,
  };
  await kvSet(sleutel(campaignId), tekst);
  return tekst;
}

/** Haalt de vaste tekst weg: de campagne schrijft daarna weer per bedrijf een mail met het model. */
export async function wisCampagneTekst(campaignId: string): Promise<void> {
  await kvDelete(sleutel(campaignId));
}
