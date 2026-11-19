import type { Metadata } from "next";
import { featureEnabled } from "@/lib/flags";
import { FLAG_ALLEEN_FLEXWERK, isNietFlexwerkPad } from "@/lib/marketing/flexwerk-only";

// ---------------------------------------------------------------------------
// Serverkant van de vlag `publiek-alleen-flexwerk`. Alleen op de server (leest
// kv via lib/flags): nooit importeren in een client-bestand. De vlag wordt per
// request gelezen (featureEnabled, met een korte kv-cache), niet vastgebakken
// bij de build.
// ---------------------------------------------------------------------------

/** Staat de vlag "publiek = alleen flexwerk" aan? Standaard uit; valt bij een storing terug op uit. */
export async function alleenFlexwerkAan(): Promise<boolean> {
  return featureEnabled(FLAG_ALLEEN_FLEXWERK);
}

/**
 * Robots-metadata voor een pagina die achter de vlag verborgen is: als de vlag
 * aan is en dit een niet-flexwerk-pad is, uit Google (wel links blijven volgen).
 * Anders leeg, zodat de pagina onveranderd blijft. Spreid dit in de metadata van
 * de pagina: `{ ...basis, ...(await robotsVerborgen("/online")) }`.
 */
export async function robotsVerborgen(pad: string): Promise<Pick<Metadata, "robots">> {
  if (!isNietFlexwerkPad(pad)) return {};
  return (await alleenFlexwerkAan()) ? { robots: { index: false, follow: true } } : {};
}
