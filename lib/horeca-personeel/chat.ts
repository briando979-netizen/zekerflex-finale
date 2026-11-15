import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvAppend, kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Een eenvoudige chat voor het eigen personeel van een horecazaak: een kanaal "team" voor iedereen van de zaak, en per
// medewerker een eigen gesprek met de beheerder ("dm-<medewerkerId>"). Bewust klein: tekst, geen bijlagen, geen push. De
// berichten staan per kanaal in één KV-waarde (horeca:chat:<tenantId>:<kanaal>, lib/privacy/org-kv.ts), de laatste 300.
// Wie wat mag lezen en schrijven bepaalt kanaalToegang(): een medewerker alleen "team" en zijn eigen gesprek.
// ---------------------------------------------------------------------------

export const MAX_BERICHT = 500;
export const BEWAAR_BERICHTEN = 300;
export const KANAAL_TEAM = "team";
export const dmKanaal = (medewerkerId: string): string => `dm-${medewerkerId}`;

export interface Bericht {
  id: string;
  /** "beheer" voor de beheerder, anders het id van de medewerker */
  van: string;
  naam: string;
  tekst: string;
  op: string;
}

/** Mag deze kijker dit kanaal gebruiken? Een medewerker (medewerkerId gevuld) alleen "team" en zijn eigen gesprek; de beheerder (leeg) elk kanaal. */
export function kanaalToegang(kanaal: string, medewerkerId: string | null): boolean {
  if (kanaal === KANAAL_TEAM) return true;
  if (!/^dm-[A-Za-z0-9-]{1,40}$/.test(kanaal)) return false;
  return medewerkerId === null || kanaal === dmKanaal(medewerkerId);
}

const sleutel = (tenantId: string, kanaal: string) => `horeca:chat:${tenantId}:${kanaal}`;

export async function berichtenVan(tenantId: string, kanaal: string): Promise<Bericht[]> {
  const ruw = await kvGet<unknown>(sleutel(tenantId, kanaal));
  return Array.isArray(ruw) ? (ruw as Bericht[]).filter((b) => b && typeof b.id === "string" && typeof b.tekst === "string") : [];
}

export async function plaatsBericht(tenantId: string, kanaal: string, van: { id: string; naam: string }, tekst: string, nu: Date = new Date()): Promise<Bericht> {
  const schoon = tekst.replace(/\r\n/g, "\n").trim();
  if (!schoon) throw AppError.validation("Schrijf eerst een bericht.");
  if (schoon.length > MAX_BERICHT) throw AppError.validation(`Een bericht mag hooguit ${MAX_BERICHT} tekens zijn.`);
  const b: Bericht = { id: randomUUID().slice(0, 12), van: van.id, naam: van.naam.slice(0, 60), tekst: schoon, op: nu.toISOString() };
  await kvAppend(sleutel(tenantId, kanaal), b, BEWAAR_BERICHTEN);
  return b;
}

/** Alleen de beheerder haalt een bericht weg (moderatie). */
export async function verwijderBericht(tenantId: string, kanaal: string, id: string): Promise<void> {
  const lijst = await berichtenVan(tenantId, kanaal);
  if (!lijst.some((b) => b.id === id)) return;
  await kvSet(sleutel(tenantId, kanaal), lijst.filter((b) => b.id !== id));
}
