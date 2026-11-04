import { kvDelete, kvListEntries, kvSet } from "@/lib/storage/kv";
import type { LiveOproep, OproepSoort } from "@/lib/horeca/zaal";

// ---------------------------------------------------------------------------
// Een gast aan tafel roept de ober of vraagt de rekening (knop op de
// QR-bestelpagina). De handheld van de bediening en het dashboard tonen dat
// meteen. Eén sleutel per tafel en soort: twee keer drukken is één oproep, en
// afhandelen is die sleutel weghalen. Na 45 minuten vervalt een oproep vanzelf.
//   horeca:oproep:<zaakId>:<tafelId>:<soort>  { op, tafelNaam }
// ---------------------------------------------------------------------------

export const OPROEP_MINUTEN = 45;
export const OPROEP_LABEL: Record<OproepSoort, string> = { ober: "Roept de ober", rekening: "Wil afrekenen" };

const k = (zaakId: string, tafelId: string, soort: OproepSoort) => `horeca:oproep:${zaakId}:${tafelId}:${soort}`;

export async function roep(zaakId: string, tafel: { id: string; naam: string }, soort: OproepSoort) {
  await kvSet(k(zaakId, tafel.id, soort), { op: new Date().toISOString(), tafelNaam: tafel.naam });
}

export async function oproepenVan(zaakId: string): Promise<(LiveOproep & { tafelNaam: string })[]> {
  const prefix = `horeca:oproep:${zaakId}:`;
  const rijen = await kvListEntries<{ op?: unknown; tafelNaam?: unknown }>(prefix, 200);
  const grens = Date.now() - OPROEP_MINUTEN * 60_000;
  const uit: (LiveOproep & { tafelNaam: string })[] = [];
  for (const r of rijen) {
    const [tafelId, soort] = r.key.slice(prefix.length).split(":");
    const op = typeof r.value?.op === "string" ? r.value.op : "";
    if (!tafelId || (soort !== "ober" && soort !== "rekening")) continue;
    // verlopen: stil opruimen
    if (!op || Date.parse(op) < grens) {
      void kvDelete(r.key).catch(() => undefined);
      continue;
    }
    uit.push({ tafelId, soort, op, tafelNaam: typeof r.value?.tafelNaam === "string" ? r.value.tafelNaam : "" });
  }
  return uit.sort((a, b) => a.op.localeCompare(b.op));
}

/** Afhandelen: één soort, of alles van die tafel (soort weggelaten). */
export async function handelAf(zaakId: string, tafelId: string, soort?: OproepSoort) {
  const soorten: OproepSoort[] = soort ? [soort] : ["ober", "rekening"];
  await Promise.all(soorten.map((s) => kvDelete(k(zaakId, tafelId, s))));
}
