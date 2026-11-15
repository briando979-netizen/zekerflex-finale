import type { Metadata } from "next";
import type { City } from "@/lib/seo-cities";
import type { Sector } from "@/lib/seo-sectors";
import { canonical } from "@/lib/seo";
import { seoBeschrijving, seoTitel } from "@/lib/seo-tekst";

// Titel, beschrijving en canonical van de sector- en stadspagina's (werkgevers- en werkerkant). Verhuisd uit
// components/marketing/SectorLanding.tsx (15 nov 2026) zodat ze zonder JSX te testen zijn (tests/seo-tekst.test.ts).

const low = (s: Sector) => s.label.toLowerCase();

export function sectorHubMetadata(s: Sector): Metadata {
  const title = `${s.label} personeel inhuren — flexkrachten & uitzendkrachten voor de ${low(s)}`;
  const description = `${s.label}personeel inhuren voor € 3,50 per gewerkt uur, zonder uitzendmarge: ${s.roles}. Vaak nog dezelfde dag gevuld.`;
  return {
    title: { absolute: seoTitel(title) },
    description: seoBeschrijving(description),
    keywords: [
      `${low(s)} personeel inhuren`,
      `${low(s)} uitzendbureau`,
      `${low(s)} flexkrachten`,
      `${low(s)} uitzendkracht`,
      `${low(s)} personeel last minute`,
    ],
    ...canonical(`/${s.slug}`, { title, description }),
  };
}

export function sectorCityMetadata(s: Sector, c: City): Metadata {
  const title = `${s.label} personeel inhuren in ${c.name} — flexkrachten & uitzendkrachten`;
  const description = `${s.label}personeel in ${c.name} voor € 3,50 per gewerkt uur, zonder uitzendmarge: ${s.roles}. Vaak nog dezelfde dag gevuld.`;
  return {
    title: { absolute: seoTitel(title) },
    description: seoBeschrijving(description),
    keywords: [
      `${low(s)} personeel inhuren ${c.name}`,
      `${low(s)} uitzendbureau ${c.name}`,
      `${low(s)} flexkrachten ${c.name}`,
      `${low(s)} uitzendkracht ${c.name}`,
      `${low(s)} personeel ${c.name} last minute`,
    ],
    ...canonical(`/${s.slug}/${c.slug}`, { title, description }),
  };
}

export function sectorWorkerHubMetadata(s: Sector): Metadata {
  const title = `Werken in de ${low(s)} — flexibele diensten & bijbanen door heel Nederland`;
  const description = `Werken in de ${low(s)}, met of zonder KVK: ${s.roles}. Kies zelf je diensten en word snel uitbetaald.`;
  return {
    title: { absolute: seoTitel(title) },
    description: seoBeschrijving(description),
    keywords: [`${low(s)} vacatures`, `werken in de ${low(s)}`, `${low(s)} bijbaan`, `${low(s)} flexwerk`, `${low(s)} uitzendwerk`],
    ...canonical(`/${s.workerSlug}`, { title, description }),
  };
}

export function sectorWorkerCityMetadata(s: Sector, c: City): Metadata {
  const title = `Werken in de ${low(s)} in ${c.name} — vacatures, bijbanen & flexwerk`;
  const description = `Werken in de ${low(s)} in ${c.name}, met of zonder KVK: ${s.roles}. Kies zelf je diensten en word snel uitbetaald.`;
  return {
    title: { absolute: seoTitel(title) },
    description: seoBeschrijving(description),
    keywords: [
      `${low(s)} vacatures ${c.name}`,
      `werken in de ${low(s)} ${c.name}`,
      `${low(s)} bijbaan ${c.name}`,
      `${low(s)} flexwerk ${c.name}`,
      `${s.worker} worden ${c.name}`,
    ],
    ...canonical(`/${s.workerSlug}/${c.slug}`, { title, description }),
  };
}
