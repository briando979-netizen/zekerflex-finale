// ---------------------------------------------------------------------------
// Interesselijst voor het nieuwe indoor entertainment megacenter: wie wil het
// als eerste weten als de deuren opengaan, en waarvoor. Pure regels, los te
// testen; opslag in schwarzwald-indoor.ts. Er gaat vanuit deze site geen mail
// uit: Het Schwarzwald exporteert de lijst bij de opening.
// ---------------------------------------------------------------------------

export const INTERESSES = ["kinderfeestje", "familie", "bedrijfsuitje", "vrijgezellen", "vrije-tijd"] as const;
export type Interesse = (typeof INTERESSES)[number];

export const INTERESSE_LABEL: Record<Interesse, string> = {
  kinderfeestje: "Kinderfeestje",
  familie: "Uitje met familie of vrienden",
  bedrijfsuitje: "Bedrijfsuitje",
  vrijgezellen: "Vrijgezellenfeest",
  "vrije-tijd": "Gewoon een middag of avond uit",
};

/** Een aanmelding vervalt 18 maanden na de laatste wijziging (AVG: niet langer dan nodig). */
export const BEWAAR_DAGEN = 548;

const isInteresse = (s: string): s is Interesse => (INTERESSES as readonly string[]).includes(s);

/** Alleen bekende interesses, zonder dubbele, in vaste volgorde. */
export function schoonInteresses(lijst: readonly string[]): Interesse[] {
  return INTERESSES.filter((i) => lijst.some((x) => isInteresse(x) && x === i));
}

/** Twee aanmeldingen van hetzelfde adres: de interesses samen, de rest van de nieuwste. */
export function voegInteressesSamen(oud: readonly Interesse[], nieuw: readonly Interesse[]): Interesse[] {
  return schoonInteresses([...oud, ...nieuw]);
}

export function verlopen(bijgewerkt: string, nu: Date): boolean {
  const t = Date.parse(bijgewerkt);
  if (Number.isNaN(t)) return true;
  return nu.getTime() - t > BEWAAR_DAGEN * 24 * 60 * 60 * 1000;
}

export function telPerInteresse(rijen: readonly { interesses: readonly Interesse[] }[]): Record<Interesse, number> {
  const tel = Object.fromEntries(INTERESSES.map((i) => [i, 0])) as Record<Interesse, number>;
  for (const r of rijen) for (const i of r.interesses) tel[i] += 1;
  return tel;
}

/** Rijen voor de Excel-export: kop plus één regel per aanmelding. */
export function indoorExport(rijen: readonly { dag: string; naam: string; email: string; interesses: readonly Interesse[]; groep?: number | undefined }[]): string[][] {
  return [
    ["Aangemeld", "Naam", "E-mailadres", "Interesse", "Groepsgrootte"],
    ...rijen.map((r) => [r.dag, r.naam, r.email, r.interesses.map((i) => INTERESSE_LABEL[i]).join(", "), r.groep ? String(r.groep) : ""]),
  ];
}
