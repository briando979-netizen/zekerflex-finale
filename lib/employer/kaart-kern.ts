import { shiftCategory } from "@/lib/shifts/category";

// ---------------------------------------------------------------------------
// Puur deel van de profielkaart van een werker voor een bedrijf (lib/employer/candidate-card.ts, 23 nov 2026): de
// beoordelingen per sector en functie met "Gewerkt bij", en de lijst bedrijven waar de werker via ZekerFlex werkte.
// Alleen wat echt is vastgelegd: een beoordeling zonder klus (oude gegevens) telt mee in het gemiddelde bovenaan, maar
// staat in geen enkele groep. `verborgen` zijn bedrijven die voor deze kijker niet bestaan (eigen-testbedrijven).
// ---------------------------------------------------------------------------

export interface KlusVoorGroep {
  title: string;
  /** naam van de gevraagde vaardigheid, als de klus die heeft */
  skill: string | null;
  tenantId: string;
  bedrijf: string;
}

export interface FunctieGroep {
  sleutel: string;
  /** de sector van de klus (lib/shifts/category.ts) */
  sector: string;
  /** de gevraagde vaardigheid; null als de klus er geen had */
  functie: string | null;
  average: number;
  count: number;
  bedrijven: { naam: string; aantal: number }[];
}

export function groepeerReviews(
  reviews: readonly { rating: number; shiftId?: string | undefined }[],
  klussen: ReadonlyMap<string, KlusVoorGroep>,
  verborgen: ReadonlySet<string> = new Set(),
): FunctieGroep[] {
  const groepen = new Map<string, { sector: string; functie: string | null; som: number; n: number; bedrijven: Map<string, number> }>();
  for (const r of reviews) {
    const klus = r.shiftId ? klussen.get(r.shiftId) : undefined;
    if (!klus || verborgen.has(klus.tenantId)) continue;
    const cat = shiftCategory(klus.title, klus.skill);
    const functie = klus.skill?.trim() || null;
    const sleutel = `${cat.key}|${(functie ?? "").toLowerCase()}`;
    const g = groepen.get(sleutel) ?? { sector: cat.label, functie, som: 0, n: 0, bedrijven: new Map<string, number>() };
    g.som += r.rating;
    g.n += 1;
    const naam = klus.bedrijf.trim();
    if (naam) g.bedrijven.set(naam, (g.bedrijven.get(naam) ?? 0) + 1);
    groepen.set(sleutel, g);
  }
  return [...groepen.entries()]
    .map(([sleutel, g]) => ({
      sleutel,
      sector: g.sector,
      functie: g.functie,
      average: Math.round((g.som / g.n) * 10) / 10,
      count: g.n,
      bedrijven: [...g.bedrijven.entries()].map(([naam, aantal]) => ({ naam, aantal })).sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam, "nl")),
    }))
    .sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector, "nl"));
}

/** De namen van de bedrijven waar de werker zelf werkte, elk één keer, de meest recente eerst. */
export function gewerktBij(rijen: readonly { tenantId: string; bedrijf: string }[], verborgen: ReadonlySet<string> = new Set(), max = 40): string[] {
  const uit: string[] = [];
  const gezien = new Set<string>();
  for (const r of rijen) {
    const naam = r.bedrijf.trim();
    if (!naam || verborgen.has(r.tenantId) || gezien.has(r.tenantId)) continue;
    gezien.add(r.tenantId);
    uit.push(naam);
    if (uit.length >= max) break;
  }
  return uit;
}
