import type { Metadata } from "next";
import type { City } from "@/lib/seo-cities";
import { inhurenHubKop, inhurenKop, rollenKort, werkHubKop, werkKop, type Sector } from "@/lib/seo-sectors";
import { canonical } from "@/lib/seo";
import { seoBeschrijving, seoTitel } from "@/lib/seo-tekst";

// Titel, beschrijving en canonical van de sector- en stadspagina's (werkgevers- en werkerkant). Verhuisd uit
// components/marketing/SectorLanding.tsx (15 nov 2026) zodat ze zonder JSX te testen zijn (tests/seo-tekst.test.ts).
// 22 nov 2026: de koppen zoals mensen zoeken (Search Console: "schoonmaakwerk", "horeca vacatures haarlem",
// "schoonmaakpersoneel inhuren"), en geen belofte meer over hoe snel een klus gevuld is.

const low = (s: Sector) => s.label.toLowerCase();

/** Wat een bedrijf betaalt, in één zin: hij moet heel blijven als Google de beschrijving inkort (tests/seo-tekst.test.ts). */
const PRIJS = "het uurtarief plus € 3,50 per gewerkt uur, zonder uitzendmarge of abonnement.";

export function sectorHubMetadata(s: Sector): Metadata {
  const title = `${inhurenHubKop(s)} — flexkrachten & uitzendkrachten voor de ${low(s)}`;
  const description = `${inhurenHubKop(s)}: ${PRIJS} Voor ${rollenKort(s)}.`;
  return {
    title: { absolute: seoTitel(title) },
    description: seoBeschrijving(description),
    keywords: [
      inhurenHubKop(s).toLowerCase(),
      `${low(s)} personeel inhuren`,
      `${low(s)} flexkrachten`,
      `${low(s)} uitzendkracht`,
      `${low(s)} personeel last minute`,
    ],
    ...canonical(`/${s.slug}`, { title, description }),
  };
}

export function sectorCityMetadata(s: Sector, c: City): Metadata {
  const title = `${inhurenKop(s)} in ${c.name} — flexkrachten & uitzendkrachten`;
  const description = `${inhurenKop(s)} in ${c.name}: ${PRIJS} Voor ${rollenKort(s)}.`;
  return {
    title: { absolute: seoTitel(title) },
    description: seoBeschrijving(description),
    keywords: [
      `${inhurenKop(s).toLowerCase()} ${c.name}`,
      `${low(s)} personeel inhuren ${c.name}`,
      `${low(s)} flexkrachten ${c.name}`,
      `${low(s)} uitzendkracht ${c.name}`,
      `${low(s)} personeel ${c.name} last minute`,
    ],
    ...canonical(`/${s.slug}/${c.slug}`, { title, description }),
  };
}

export function sectorWorkerHubMetadata(s: Sector): Metadata {
  const title = `${werkHubKop(s)} — flexibele diensten door heel Nederland`;
  const description = `Werk als ${s.worker}, met of zonder KVK: ${rollenKort(s)}. Kies zelf je diensten en zie vooraf wat je verdient.`;
  return {
    title: { absolute: seoTitel(title) },
    description: seoBeschrijving(description),
    keywords: [`${low(s)} vacatures`, `werken als ${s.worker}`, `werken in de ${low(s)}`, `${low(s)} bijbaan`, `${low(s)} werk`],
    ...canonical(`/${s.workerSlug}`, { title, description }),
  };
}

export function sectorWorkerCityMetadata(s: Sector, c: City): Metadata {
  const title = `${werkKop(s)} in ${c.name} — bijbanen & flexwerk`;
  const description = `Werk als ${s.worker} in ${c.name}, met of zonder KVK: ${rollenKort(s)}. Kies zelf je diensten en zie vooraf wat je verdient.`;
  return {
    title: { absolute: seoTitel(title) },
    description: seoBeschrijving(description),
    keywords: [
      `${werkKop(s).toLowerCase()} ${c.name}`,
      `${low(s)} vacatures ${c.name}`,
      `werken als ${s.worker} ${c.name}`,
      `${low(s)} bijbaan ${c.name}`,
      `${low(s)} werk ${c.name}`,
    ],
    ...canonical(`/${s.workerSlug}/${c.slug}`, { title, description }),
  };
}
