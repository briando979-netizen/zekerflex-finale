import { kvGet, kvSet } from "@/lib/storage/kv";
import { structuurToestand, STRUCTUUR_STATUSSEN, structuurPunt, type StructuurStatus, type StructuurToestand } from "@/lib/accountant/structuur";
import type { VraagAntwoord } from "@/lib/accountant/antwoord";

// Opslag in de KV-tabel (geen migratie): de status per punt van de structuurcheck en de laatste
// vragen aan de vraagbalk. Geen persoonsgegevens: de vraag wordt afgekapt bewaard en hoort niet bij een gebruiker.

const K_STRUCTUUR = "accountant:structuur";
const K_VRAGEN = "accountant:vragen";
const MAX_VRAGEN = 30;

export interface BewaardeVraag {
  op: string;
  vraag: string;
  soort: VraagAntwoord["soort"];
  door: VraagAntwoord["door"];
}

export async function getStructuur(): Promise<StructuurToestand> {
  return structuurToestand(await kvGet<Record<string, unknown>>(K_STRUCTUUR));
}

export async function zetStructuur(id: string, status: StructuurStatus): Promise<StructuurToestand> {
  if (!structuurPunt(id) || !STRUCTUUR_STATUSSEN.includes(status)) return getStructuur();
  const nu = { ...(await getStructuur()), [id]: status };
  await kvSet(K_STRUCTUUR, nu);
  return nu;
}

export async function getVragen(): Promise<BewaardeVraag[]> {
  return (await kvGet<BewaardeVraag[]>(K_VRAGEN)) ?? [];
}

export async function bewaarVraag(vraag: string, a: VraagAntwoord, nu = new Date()): Promise<void> {
  const lijst = await getVragen();
  lijst.unshift({ op: nu.toISOString(), vraag: vraag.slice(0, 300), soort: a.soort, door: a.door });
  await kvSet(K_VRAGEN, lijst.slice(0, MAX_VRAGEN));
}
