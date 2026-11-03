import { kvGet, kvSet } from "@/lib/storage/kv";
import { AGENDA, STANDAARD_OPEN, type AgendaConfig, type AgendaRegel, type Blokkade } from "@/lib/voorstel/schwarzwald-agenda";

// ---------------------------------------------------------------------------
// Wat de beheerder van Het Schwarzwald zelf instelt, bovenop de standaard uit
// schwarzwald-agenda.ts: per activiteit capaciteit, groep, prijs, duur en
// online aan/uit; openingstijden per weekdag; gesloten datums; blokkades
// (deel van een dag); een aankondiging bovenaan de site. Eén KV-record, geen
// migratie.
// ---------------------------------------------------------------------------

const SLEUTEL = "voorstel-schwarzwald:instellingen";

export interface ActiviteitInstelling {
  online?: boolean | undefined;
  duurMin?: number | undefined;
  capaciteit?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  prijsPP?: number | undefined;
  prijsPPZondag?: number | undefined;
}

export interface Instellingen {
  activiteiten: Record<string, ActiviteitInstelling>;
  /** "0".."6" (0 = zondag) -> van/tot in minuten, null = dicht; ontbreekt = standaard */
  open: Record<string, { van: number; tot: number } | null>;
  gesloten: string[];
  /** een deel van een dag dicht, per activiteit of voor alles */
  blokkades: Blokkade[];
  aankondiging: string;
}

export const LEEG: Instellingen = { activiteiten: {}, open: {}, gesloten: [], blokkades: [], aankondiging: "" };

export async function leesInstellingen(): Promise<Instellingen> {
  const opgeslagen = await kvGet<Partial<Instellingen>>(SLEUTEL).catch(() => null);
  return { ...LEEG, ...(opgeslagen ?? {}) };
}

export async function slaInstellingenOp(i: Instellingen): Promise<void> {
  await kvSet(SLEUTEL, i);
}

/** Standaardregels met de instellingen van de beheerder eroverheen. */
export function maakConfig(i: Instellingen): AgendaConfig {
  const regels: Record<string, AgendaRegel> = {};
  for (const [slug, standaard] of Object.entries(AGENDA)) {
    const { online, ...rest } = i.activiteiten[slug] ?? {};
    if (online === false) continue;
    // lege velden betekenen "standaard houden"
    const gezet = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v === "number"));
    regels[slug] = { ...standaard, ...gezet };
  }
  const open = { ...STANDAARD_OPEN };
  for (const [dag, tijden] of Object.entries(i.open)) open[Number(dag)] = tijden;
  return { regels, open, gesloten: i.gesloten, blokkades: i.blokkades };
}

export async function agendaConfig(): Promise<AgendaConfig> {
  return maakConfig(await leesInstellingen());
}
