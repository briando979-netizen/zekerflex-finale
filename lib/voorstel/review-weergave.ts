// Pure helpers voor beoordelingen (ook in de browser bruikbaar en los te testen).

/** "Klaas de Vries" → "Klaas V.": voornaam plus eerste letter van de achternaam. */
export function publiekeNaam(naam: string): string {
  const delen = naam.trim().split(/\s+/).filter(Boolean);
  const [voor, ...rest] = delen;
  if (!voor) return "Gast";
  const laatste = rest[rest.length - 1];
  return laatste ? `${voor} ${laatste[0]?.toUpperCase()}.` : voor;
}

/** Gemiddelde score met één decimaal, of null zonder beoordelingen. */
export function gemiddelde(reviews: { score: number }[]): number | null {
  if (!reviews.length) return null;
  return Math.round((reviews.reduce((s, r) => s + r.score, 0) / reviews.length) * 10) / 10;
}

/** "★★★★☆" voor een score van 1 tot 5. */
export const sterren = (score: number) => "★".repeat(Math.max(0, Math.min(5, score))) + "☆".repeat(5 - Math.max(0, Math.min(5, score)));
