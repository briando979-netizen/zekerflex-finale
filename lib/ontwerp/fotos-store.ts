import { cache } from "react";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { mediaLijst, uploadMedia } from "@/lib/ontwerp/media";
import { normalizeFotoKeuze, normalizeFotoKeuzes, type FotoKeuze, type FotoKeuzes } from "@/lib/ontwerp/fotos";
import type { PhotoKey } from "@/lib/marketing/photo-specs";

// ---------------------------------------------------------------------------
// Opslag van de fotokeuzes (KV ontwerp:fotos). Geen keuze of de opslag is even
// weg = de standaardfoto. Een keuze waarvan de foto uit de bibliotheek is
// verwijderd telt niet: dan weer de standaard, nooit een kapotte afbeelding.
// ---------------------------------------------------------------------------

const KEY = "ontwerp:fotos";

export async function getFotoKeuzes(): Promise<FotoKeuzes> {
  const raw = await kvGet<unknown>(KEY).catch(() => null);
  return raw ? normalizeFotoKeuzes(raw) : {};
}

/** Per verzoek één keer opgehaald (een pagina toont soms meerdere foto's). Alleen keuzes met een bestaande foto. */
export const actieveFotoKeuzes = cache(async (): Promise<FotoKeuzes> => {
  const keuzes = await getFotoKeuzes();
  const lijst = Object.entries(keuzes) as [PhotoKey, FotoKeuze][];
  if (!lijst.length) return {};
  const fotos = new Set((await mediaLijst().catch(() => [])).filter((m) => m.soort === "foto").map((m) => m.id));
  const uit: FotoKeuzes = {};
  for (const [k, v] of lijst) if (fotos.has(v.media)) uit[k] = v;
  return uit;
});

/**
 * Een foto uit Studio blijvend maken: public/marketing zit in de container en
 * verdwijnt bij de volgende uitrol, dus ook in de mediabibliotheek (opslagvolume)
 * en als keuze voor de plek. Mislukt dat, dan staat hij er tot de volgende uitrol.
 */
export async function maakSiteFotoBlijvend(plek: PhotoKey, bytes: Buffer, naam: string): Promise<boolean> {
  try {
    const item = await uploadMedia(bytes, naam);
    await zetFotoKeuze(plek, { media: item.id, alt: "" });
    return true;
  } catch {
    return false;
  }
}

/** Eén plek zetten (null = terug naar de standaardfoto). */
export async function zetFotoKeuze(plek: PhotoKey, raw: unknown | null): Promise<FotoKeuzes> {
  const keuzes = await getFotoKeuzes();
  const k = raw === null ? null : normalizeFotoKeuze(raw);
  if (k) keuzes[plek] = k;
  else delete keuzes[plek];
  await kvSet(KEY, keuzes);
  return keuzes;
}
