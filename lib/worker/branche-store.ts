import { kvGet, kvSet } from "@/lib/storage/kv";
import { maakBrancheKeuze, type BrancheKeuze } from "@/lib/shifts/branche-keuze";

// De branches die een werker bij de start koos (of "alle branches"). Per gebruiker in de KV
// (sleutelvoorvoegsel in ERASABLE_KV_PREFIXES, dus mee in export en wissen). Het is een voorkeur:
// de lijst met klussen filtert er standaard op, de werker kan het filter altijd weghalen.

const sleutel = (userId: string) => `werker-branches:${userId}`;

export async function getBrancheKeuze(userId: string): Promise<BrancheKeuze | null> {
  const ruw = await kvGet<{ alle?: unknown; branches?: unknown }>(sleutel(userId));
  return ruw ? maakBrancheKeuze(ruw) : null;
}

/** Bewaart de keuze; null (niets gekozen) wordt nooit bewaard. */
export async function setBrancheKeuze(userId: string, invoer: { alle?: unknown; branches?: unknown }): Promise<BrancheKeuze | null> {
  const keuze = maakBrancheKeuze(invoer);
  if (!keuze) return null;
  await kvSet(sleutel(userId), { ...keuze, at: new Date().toISOString() });
  return keuze;
}
