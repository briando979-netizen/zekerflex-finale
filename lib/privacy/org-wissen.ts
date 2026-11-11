import { AppError } from "@/lib/errors";
import { kvDelete, kvDeleteStale, kvGet, kvListEntries } from "@/lib/storage/kv";
import { redactSecrets } from "@/lib/privacy/user-kv";
import { ORGANISATIE_ID, ORG_KV_REGISTER, orgSleutel } from "@/lib/privacy/org-kv";

// ---------------------------------------------------------------------------
// Wissen en exporteren van de KV-gegevens van één organisatie, op basis van het register in lib/privacy/org-kv.ts.
// Raakt alleen sleutels met het id van die organisatie (of een openbaar opzoekrijtje dat naar haar verwijst) en nooit
// het auditspoor. Er komt niets in een log: alleen aantallen.
// ---------------------------------------------------------------------------

/** Hoeveel rijen een opzoekrijtje (links, boekadres) hooguit wordt doorzocht; daarboven blijft er niets stil staan maar valt er een fout. */
const MAX_VERWIJZINGEN = 20_000;

function controleer(orgId: string): void {
  if (!ORGANISATIE_ID.test(orgId)) throw AppError.validation("Dit is geen geldige organisatie.");
}

/**
 * Alles wissen wat de modules van het register van deze organisatie bewaren. Voor als de organisatie niet meer bestaat
 * (zie wisVerlatenOrganisaties). Idempotent. Geeft per module het aantal gewiste rijen terug.
 */
export async function wisOrganisatieGegevens(orgId: string, nu: Date = new Date()): Promise<Record<string, number>> {
  controleer(orgId);
  // wat tot een minuut in de toekomst is bijgewerkt telt ook mee (klokverschil tussen servers)
  const tot = new Date(nu.getTime() + 60_000);
  const perModule: Record<string, number> = {};
  const tel = (module: string, n: number) => {
    if (n > 0) perModule[module] = (perModule[module] ?? 0) + n;
  };

  // eerst de openbare opzoekrijtjes: de waarde zegt bij welke organisatie ze horen
  for (const regel of ORG_KV_REGISTER) {
    if (regel.soort !== "verwijzing") continue;
    const rijen = await kvListEntries<{ tenantId?: string }>(regel.voorvoegsel, MAX_VERWIJZINGEN + 1);
    if (rijen.length > MAX_VERWIJZINGEN) throw AppError.conflict("Er zijn te veel openbare links om de organisatie in één keer te wissen. Neem contact op met ZekerFlex.");
    for (const r of rijen) {
      if (r.value?.tenantId !== orgId) continue;
      await kvDelete(r.key);
      tel(regel.module, 1);
    }
  }
  for (const regel of ORG_KV_REGISTER) {
    if (regel.soort === "verwijzing") continue;
    if (regel.soort === "exact") {
      const sleutel = orgSleutel(regel, orgId);
      if ((await kvGet(sleutel)) === null) continue;
      await kvDelete(sleutel);
      tel(regel.module, 1);
    } else {
      tel(regel.module, await kvDeleteStale(orgSleutel(regel, orgId), tot));
    }
  }
  return perModule;
}

/** Een rij van een export van de organisatiegegevens. */
export interface OrgKvRij {
  module: string;
  omschrijving: string;
  key: string;
  value: unknown;
}

/**
 * Alle rijen van de organisatie voor inzage of overdracht (AVG art. 15/20), met geheimen en hashes afgeschermd.
 * Per voorvoegsel hooguit `perVoorvoegsel` rijen (standaard 5000).
 */
export async function exporteerOrganisatieGegevens(orgId: string, perVoorvoegsel = 5000): Promise<OrgKvRij[]> {
  controleer(orgId);
  const uit: OrgKvRij[] = [];
  for (const regel of ORG_KV_REGISTER) {
    if (regel.soort === "verwijzing") continue; // alleen hashes naar de organisatie: niets om te tonen
    const sleutel = orgSleutel(regel, orgId);
    const rijen =
      regel.soort === "exact"
        ? await kvGet(sleutel).then((v) => (v === null ? [] : [{ key: sleutel, value: v as unknown }]))
        : await kvListEntries<unknown>(sleutel, perVoorvoegsel);
    for (const r of rijen) uit.push({ module: regel.module, omschrijving: regel.omschrijving, key: r.key, value: redactSecrets(r.value) });
  }
  return uit;
}
