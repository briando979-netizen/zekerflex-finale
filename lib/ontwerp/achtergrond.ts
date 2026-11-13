import { kvGet, kvSet } from "@/lib/storage/kv";
import { mediaLijst } from "@/lib/ontwerp/media";
import { GEEN_ACHTERGROND, kiesWeergave, leesInstelling, type AchtergrondInstelling, type AchtergrondKeuze, type AchtergrondPagina, type AchtergrondWeergave } from "@/lib/ontwerp/achtergrond-core";

// Eén sleutel voor de site zelf (geen gegevens van een gebruiker, dus niet in ERASABLE_KV_PREFIXES).
const SLEUTEL = "ontwerp:achtergrond";

export async function leesAchtergronden(): Promise<AchtergrondInstelling> {
  return leesInstelling(await kvGet<unknown>(SLEUTEL).catch(() => null));
}

export async function zetAchtergrond(pagina: AchtergrondPagina, keuze: AchtergrondKeuze | null): Promise<AchtergrondInstelling> {
  const nu = await leesAchtergronden();
  const nieuw: AchtergrondInstelling = { ...GEEN_ACHTERGROND, ...nu, [pagina]: keuze };
  await kvSet(SLEUTEL, nieuw);
  return nieuw;
}

/** Wat een pagina moet tonen, of null (dan verandert er niets). Faalt nooit: een storing geeft gewoon "geen". */
export async function achtergrondVoor(pagina: AchtergrondPagina): Promise<AchtergrondWeergave | null> {
  try {
    const keuze = (await leesAchtergronden())[pagina];
    if (!keuze) return null;
    return kiesWeergave(keuze, await mediaLijst());
  } catch {
    return null;
  }
}
