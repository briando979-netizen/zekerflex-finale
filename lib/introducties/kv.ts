import { kvGet, kvGetMany, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import type { IntroductieRol } from "@/lib/introducties/regels";
import type { VrijePeriode } from "@/lib/introducties/periode";

// ---------------------------------------------------------------------------
// De opslag van "Introduceer een bedrijf" (lib/introducties/regels.ts), in de KV, zonder schemawijziging:
//   introducties:<userId>           → Introductie[]: wat iemand voorstelde. Per persoon: in de inzage (exportUserKv) en
//                                     weg met het account (ERASABLE_KV_PREFIXES, lib/privacy/user-kv.ts).
//   introductie-klant:<tenantId>    → IntroductieKoppeling: het bedrijf dat via een introductie klant werd, met de twee
//                                     weken zonder platformkosten (de instelling van het bedrijf, gelezen bij goedkeuren).
//   introductie-beloning:<tenantId> → IntroductieBeloning: één keer gezet (kvSetIfAbsent) zodra de eerste factuur voor
//                                     platformkosten betaald is.
//   introductie-lead:<leadId>       → KoppelClaim { tenantId, at }: welk bedrijf deze lead claimde (eenmalig, kvSetIfAbsent)
//   introductie-bedrijf:<tenantId>  → { leadId }: welke lead dit bedrijf claimde. Samen: één koppeling per lead en per bedrijf,
//                                     ook als twee beheerders tegelijk klikken. De koppeling zelf wordt als laatste geschreven.
// "Beloning verstuurd" = de taak in Beheer → Te doen afgevinkt (owner-todos:done, lib/admin/owner-todos.ts): één bron.
// Naam, e-mailadres en telefoonnummer van de contactpersoon staan hier bewust niet: alleen in de lead (SalesLead, bij een
// bestaande lead in enrichmentJson.introductieContacten), zodat ze de regels van sales volgen (onderdrukken, verwijderen).
// ---------------------------------------------------------------------------

export interface Introductie {
  id: string;
  at: string;
  rol: IntroductieRol;
  bedrijf: string;
  /** de lead (nieuw of al bekend); null als het bedrijf al klant was */
  leadId: string | null;
  /** het bedrijf werkte al met ZekerFlex (zelfde adres of zakelijk domein) */
  alKlantTenantId: string | null;
  /** er bestond al een lead voor dit adres, domein of nummer */
  bestondAl: boolean;
}

export interface IntroductieKoppeling extends VrijePeriode {
  tenantId: string;
  leadId: string;
  /** de introductie die de beloning krijgt (de eerste voor deze lead) */
  introId: string;
  /** wie die introductie deed */
  userId: string;
  /** de naam van het voorgestelde bedrijf zoals de introductie hem gaf */
  bedrijf: string;
  gekoppeldOp: string;
  /** de beheerder die koppelde */
  door: string;
}

export interface IntroductieBeloning {
  tenantId: string;
  introId: string;
  userId: string;
  bedrijf: string;
  factuurId: string;
  factuurNummer: string;
  /** wanneer de betaling binnenkwam (Stripe of overschrijving) */
  betaaldOp: string;
}

const LIJST = "introducties:";
export const lijstSleutel = (userId: string): string => `introducties:${userId}`;
export const koppelSleutel = (tenantId: string): string => `introductie-klant:${tenantId}`;
export const beloningSleutel = (tenantId: string): string => `introductie-beloning:${tenantId}`;
export const leadClaimSleutel = (leadId: string): string => `introductie-lead:${leadId}`;
export const bedrijfClaimSleutel = (tenantId: string): string => `introductie-bedrijf:${tenantId}`;

/** Wie een lead claimde bij het koppelen, en wanneer (de gratis weken rekenen vanaf dit moment, ook bij een herhaling). */
export type KoppelClaim = {
  tenantId: string;
  at: string;
};
/** Dezelfde sleutel als de afgevinkte taken in lib/admin/owner-todos.ts (tests/introductie-beloning.test.ts bewaakt dat). */
export const TODO_KLAAR_SLEUTEL = "owner-todos:done";

const alsLijst = (v: unknown): Introductie[] => (Array.isArray(v) ? (v as Introductie[]) : []);

export async function leesLijst(userId: string): Promise<Introductie[]> {
  return alsLijst(await kvGet<unknown>(lijstSleutel(userId)));
}

export async function schrijfLijst(userId: string, lijst: Introductie[]): Promise<void> {
  await kvSet(lijstSleutel(userId), lijst);
}

/** Alle lijsten (Beheer); het aantal mensen met een introductie is klein. */
export async function alleLijsten(limiet = 2000): Promise<{ userId: string; lijst: Introductie[] }[]> {
  const rijen = await kvListEntries<unknown>(LIJST, limiet);
  return rijen.map((r) => ({ userId: r.key.slice(LIJST.length), lijst: alsLijst(r.value) }));
}

export async function leesKoppeling(tenantId: string): Promise<IntroductieKoppeling | null> {
  return kvGet<IntroductieKoppeling>(koppelSleutel(tenantId));
}

/** Per tenantId de koppeling en de beloning (als die er zijn). */
export async function leesPerBedrijf(tenantIds: readonly string[]): Promise<{ koppelingen: Map<string, IntroductieKoppeling>; beloningen: Map<string, IntroductieBeloning> }> {
  const ids = [...new Set(tenantIds)];
  if (ids.length === 0) return { koppelingen: new Map(), beloningen: new Map() };
  const [k, b] = await Promise.all([kvGetMany<IntroductieKoppeling>(ids.map(koppelSleutel)), kvGetMany<IntroductieBeloning>(ids.map(beloningSleutel))]);
  const koppelingen = new Map<string, IntroductieKoppeling>();
  const beloningen = new Map<string, IntroductieBeloning>();
  for (const id of ids) {
    const kk = k.get(koppelSleutel(id));
    const bb = b.get(beloningSleutel(id));
    if (kk) koppelingen.set(id, kk);
    if (bb) beloningen.set(id, bb);
  }
  return { koppelingen, beloningen };
}

export async function alleBeloningen(limiet = 1000): Promise<IntroductieBeloning[]> {
  return kvListValues<IntroductieBeloning>("introductie-beloning:", limiet);
}

/** De taken die de eigenaar in Te doen afvinkte ({ [id]: { at, by } }). */
export async function leesTodoKlaar(): Promise<Record<string, { at: string; by: string }>> {
  return (await kvGet<Record<string, { at: string; by: string }>>(TODO_KLAAR_SLEUTEL)) ?? {};
}
