import type { Metadata } from "next";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { canonical } from "@/lib/seo";
import { SEO_PADEN, SEO_STANDAARD, normalizeSeoEigen, volledigeTitel, type SeoEigen, type SeoPad } from "@/lib/ontwerp/seo";

// ---------------------------------------------------------------------------
// Opslag van de eigen titels en omschrijvingen (KV ontwerp:seo) en de
// metadata voor de vaste pagina's. Zonder eigen versie (of bij een storing)
// geeft seoMetadata precies wat de pagina vóór de ontwerper had.
// ---------------------------------------------------------------------------

const KEY = "ontwerp:seo";

export async function getSeoEigen(): Promise<Partial<Record<SeoPad, SeoEigen>>> {
  const raw = await kvGet<Record<string, unknown>>(KEY).catch(() => null);
  const uit: Partial<Record<SeoPad, SeoEigen>> = {};
  for (const pad of SEO_PADEN) {
    const e = normalizeSeoEigen(raw?.[pad]);
    if (e) uit[pad] = e;
  }
  return uit;
}

/** null of beide velden leeg = terug naar de standaard. */
export async function zetSeoEigen(pad: SeoPad, raw: unknown): Promise<Partial<Record<SeoPad, SeoEigen>>> {
  const alles = await getSeoEigen();
  const e = normalizeSeoEigen(raw);
  if (e) alles[pad] = e;
  else delete alles[pad];
  await kvSet(KEY, alles);
  return alles;
}

/** Titel, omschrijving en canonical/OpenGraph voor een vaste pagina; `extra` = de rest (keywords, auteur …). */
export async function seoMetadata(pad: SeoPad, extra: Metadata = {}): Promise<Metadata> {
  const s = SEO_STANDAARD[pad];
  const eigen = (await getSeoEigen().catch(() => ({}) as Partial<Record<SeoPad, SeoEigen>>))[pad];
  const titel = eigen?.titel || s.titel;
  const omschrijving = eigen?.omschrijving || s.omschrijving;
  // de homepage gaf zijn titel en omschrijving altijd aan OpenGraph; de andere pagina's alleen met een eigen versie,
  // en dan met " · ZekerFlex" erachter, net als de standaard-og:title die Next uit het titelsjabloon haalt
  const og = s.absoluut ? { title: titel, description: omschrijving } : eigen ? { title: volledigeTitel(pad, titel), description: omschrijving } : undefined;
  return {
    ...extra,
    title: s.absoluut ? { absolute: titel } : titel,
    description: omschrijving,
    ...canonical(pad, og),
  };
}
