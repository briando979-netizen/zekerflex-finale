import { env } from "@/lib/env";
import { getOrgProfileExtra, saveOrgProfileExtra, type OrgProfileExtra } from "@/lib/profile/store";

// ---------------------------------------------------------------------------
// Instellingen voor e-facturatie: per bedrijf (in het profiel-KV-blok, dus
// zonder migratie) en voor het platform (omgeving). Puur lezen en schrijven;
// het bouwen en versturen staat in factuur.ts en bezorging.ts.
// ---------------------------------------------------------------------------

export type EfactuurInstellingen = NonNullable<OrgProfileExtra["efactuur"]>;

/** 0106:12345678 (KVK), 9944:NL123456789B01 (btw) of 0190:… (OIN) */
const PEPPOL_ID = /^(0106|9944|0190|0088):[A-Za-z0-9]{4,40}$/;

export function peppolIdGeldig(id: string): boolean {
  return PEPPOL_ID.test(id.trim());
}

/** "0106:12345678" → { schema: "0106", id: "12345678" } */
export function splitsPeppolId(id: string | undefined): { schema: string; id: string } | undefined {
  if (!id || !peppolIdGeldig(id)) return undefined;
  const [schema, waarde] = id.trim().split(":");
  return schema && waarde ? { schema, id: waarde } : undefined;
}

export async function efactuurInstellingen(tenantId: string): Promise<EfactuurInstellingen> {
  return (await getOrgProfileExtra(tenantId)).efactuur ?? {};
}

export async function bewaarEfactuurInstellingen(tenantId: string, patch: EfactuurInstellingen): Promise<EfactuurInstellingen> {
  const huidig = await efactuurInstellingen(tenantId);
  const volgende: EfactuurInstellingen = { ...huidig };
  if ("peppolId" in patch) {
    const id = patch.peppolId?.trim();
    if (id) volgende.peppolId = id;
    else delete volgende.peppolId;
  }
  if ("ontvangstEmail" in patch) {
    const mail = patch.ontvangstEmail?.trim().toLowerCase();
    if (mail) volgende.ontvangstEmail = mail;
    else delete volgende.ontvangstEmail;
  }
  if (patch.automatisch !== undefined) volgende.automatisch = patch.automatisch;
  await saveOrgProfileExtra(tenantId, { efactuur: volgende });
  return volgende;
}

/** Is er een Peppol-toegangspunt ingesteld, zodat facturen echt het netwerk op kunnen? */
export function peppolIngesteld(): boolean {
  return Boolean(env.PEPPOL_AP_URL && env.PEPPOL_AP_TOKEN);
}

/** De verkoper op platformfacturen, uit de omgeving (Admin → Te doen vraagt de eigenaar deze in te vullen). */
export function platformPartij(): { naam: string; kvk?: string; btw?: string; straat?: string; postcode?: string; plaats?: string; compleet: boolean } {
  const kvk = env.PLATFORM_KVK?.replace(/\D/g, "");
  const btw = env.PLATFORM_VAT?.replace(/[\s.-]/g, "").toUpperCase();
  return {
    naam: env.PLATFORM_LEGAL_NAME,
    ...(kvk ? { kvk } : {}),
    ...(btw ? { btw } : {}),
    ...(env.PLATFORM_STREET ? { straat: env.PLATFORM_STREET } : {}),
    ...(env.PLATFORM_POSTAL_CODE ? { postcode: env.PLATFORM_POSTAL_CODE } : {}),
    ...(env.PLATFORM_CITY ? { plaats: env.PLATFORM_CITY } : {}),
    compleet: Boolean(kvk && btw && env.PLATFORM_STREET && env.PLATFORM_POSTAL_CODE && env.PLATFORM_CITY),
  };
}
