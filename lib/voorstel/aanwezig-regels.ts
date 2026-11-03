// ---------------------------------------------------------------------------
// Aanmelden bij de balie: het personeel zet op de dag zelf per reservering
// "aangekomen" of "niet gekomen". Puur, dus ook in de browser bruikbaar en
// los te testen.
// ---------------------------------------------------------------------------

export type Aanwezig = "ja" | "nee";

export const AANWEZIG_LABEL: Record<Aanwezig, string> = { ja: "aangekomen", nee: "niet gekomen" };

/** Waarom deze reservering (nog) niet aan te melden is, of null. */
export function aanmeldFout(b: { datum: string; status: string }, vandaag: string): string | null {
  if (b.status === "geannuleerd") return "Een geannuleerde reservering kun je niet aanmelden.";
  if (b.datum > vandaag) return "Aanmelden kan vanaf de dag zelf.";
  return null;
}

/** De stand bij de balie: verwachte en binnengekomen gasten, niet gekomen en nog niet aangemeld. */
export function balieStand(boekingen: { personen: number; status: string; aanwezig?: Aanwezig | undefined }[]) {
  const actief = boekingen.filter((b) => b.status !== "geannuleerd");
  return {
    verwacht: actief.reduce((s, b) => s + b.personen, 0),
    binnen: actief.filter((b) => b.aanwezig === "ja").reduce((s, b) => s + b.personen, 0),
    nietGekomen: actief.filter((b) => b.aanwezig === "nee").length,
    open: actief.filter((b) => !b.aanwezig).length,
  };
}
