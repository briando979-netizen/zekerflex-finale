// Testers voor de Android-app (21 nov 2026, eigenaar: "tester worden" als formulier in plaats van een mail). Puur bestand.

export interface TesterAanvraag {
  email: string;
  platform: "android";
  /** ISO-tijd van de aanvraag */
  at: string;
  /** door de eigenaar in de Play Console op de testerslijst gezet */
  toegevoegd: boolean;
}

/** Een gewoon e-mailadres (de Play Store werkt met een Google-account; dat kan ook een niet-Gmail-adres zijn). */
export function schoonTesterAdres(ruw: string): string | null {
  const e = ruw.trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) && e.length <= 200 ? e : null;
}

/** Voeg toe zonder dubbele; een bestaande aanvraag blijft staan (ook als hij al is toegevoegd). Nieuwste bovenaan, hooguit `max`. */
export function metNieuweTester(lijst: readonly TesterAanvraag[], email: string, now: Date, max = 2000): { lijst: TesterAanvraag[]; nieuw: boolean } {
  if (lijst.some((t) => t.email === email)) return { lijst: [...lijst], nieuw: false };
  return { lijst: [{ email, platform: "android", at: now.toISOString(), toegevoegd: false }, ...lijst].slice(0, max), nieuw: true };
}

/** De adressen die nog in de Play Console moeten, met komma's (zo plak je ze in de testerslijst). */
export function nogToevoegen(lijst: readonly TesterAanvraag[]): string {
  return lijst.filter((t) => !t.toegevoegd).map((t) => t.email).join(", ");
}
