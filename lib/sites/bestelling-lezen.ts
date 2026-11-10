import { kvGet } from "@/lib/storage/kv";
import type { SiteBestelling } from "@/lib/sites/bestellingen";
import type { BestelOverzicht } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// Eén bestelling van een klantsite lezen, los van lib/sites/bestellingen.ts
// (dat lib/sites/serve.ts gebruikt; zo ontstaat er geen kring). De bedankpagina
// vraagt hem op met het nummer én het id uit de doorverwijzing na het plaatsen,
// en krijgt alleen het overzicht: nooit naam, adres of contactgegevens.
// ---------------------------------------------------------------------------

export const bestelKey = (siteId: string, id: string) => `site-bestelling:${siteId}:${id}`;

export const isBestelId = (s: string) => /^o[a-z0-9]{10,24}$/.test(s);

/** Het overzicht van een bestelling voor de bedankpagina, als nummer en id bij elkaar horen; anders null. */
export async function besteldOverzicht(siteId: string, nr: string, id: string): Promise<BestelOverzicht | null> {
  if (!isBestelId(id)) return null;
  const rec = await kvGet<SiteBestelling>(bestelKey(siteId, id));
  if (!rec || rec.nr !== nr) return null;
  // alleen wat de bedankpagina nodig heeft, met naam erbij opgesomd: zo komt er nooit vanzelf een klantveld bij
  return {
    regels: rec.regels,
    subtotaalCents: rec.subtotaalCents,
    bezorgkostenCents: rec.bezorgkostenCents,
    totaalCents: rec.totaalCents,
    ...(rec.verzending ? { verzending: rec.verzending } : {}),
    ...(rec.korting ? { korting: rec.korting } : {}),
    ...(rec.btw ? { btw: rec.btw } : {}),
    ...(rec.betaalmethode ? { betaalmethode: rec.betaalmethode } : {}),
    ...(rec.rekening ? { rekening: rec.rekening } : {}),
  };
}
