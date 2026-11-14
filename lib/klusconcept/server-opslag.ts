import { z } from "zod";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { parseConcept, type KlusConcept } from "@/lib/klusconcept/concept";

// ---------------------------------------------------------------------------
// Het klusconcept van /klus-plaatsen ook aan de serverkant (14 nov 2026).
//
// Het concept wacht in localStorage (CONCEPT_KEY) tot de werkgever is aangemeld.
// Wie de bevestigingsmail op een ander apparaat opent, verloor het: daar is die
// browser niet. Daarom gaat het concept bij het aanmelden als verborgen veld mee
// in de registratie (geen nieuwe openbare route) en bewaren we het hier onder
// "klus-concept:<userId>", veertien dagen zoals lokaal. Alleen de conceptvelden,
// met grenzen; NewShiftForm haalt het op als er lokaal niets is en de server
// wist het zodra de klus is geplaatst (createShiftAction) of als het verlopen is.
// Het voorvoegsel staat in ERASABLE_KV_PREFIXES (lib/privacy/user-kv.ts).
// ---------------------------------------------------------------------------

export const KLUS_CONCEPT_PREFIX = "klus-concept:";
export const klusConceptSleutel = (userId: string) => `${KLUS_CONCEPT_PREFIX}${userId}`;

/** Het verborgen veld in het aanmeldformulier mag nooit groter zijn dan dit (de velden zelf zijn samen <2,5 KB). */
export const MAX_CONCEPT_TEKENS = 4096;

const tijd = /^\d{1,2}:\d{2}$/;

/** Dezelfde grenzen als parseConcept (lib/klusconcept/concept.ts), maar als schema: niets anders komt erdoor. */
export const klusConceptSchema = z
  .object({
    v: z.literal(1),
    title: z.string().trim().min(2).max(120),
    description: z.string().max(2000),
    city: z.string().trim().max(80),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start: z.string().regex(tijd),
    end: z.string().regex(tijd),
    breakMinutes: z.number().int().min(0).max(240),
    positions: z.number().int().min(1).max(50),
    rateCents: z.number().int().min(1).max(50_000),
    savedAt: z.number().int().positive(),
  })
  .strict();

/**
 * Het verborgen veld uit het aanmeldformulier → een geldig concept, of null.
 * Eerst de vorm (schema), dan de inhoud en de leeftijd (parseConcept, 14 dagen). Nooit een fout: een
 * kapot of te oud concept houdt het aanmelden niet tegen.
 */
export function leesConceptUitFormulier(raw: unknown, now = Date.now()): KlusConcept | null {
  if (typeof raw !== "string" || !raw || raw.length > MAX_CONCEPT_TEKENS) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = klusConceptSchema.safeParse(json);
  if (!parsed.success) return null;
  return parseConcept(JSON.stringify(parsed.data), now);
}

export async function bewaarConceptVoorGebruiker(userId: string, concept: KlusConcept): Promise<void> {
  await kvSet(klusConceptSleutel(userId), concept);
}

/**
 * Het bewaarde concept van deze gebruiker, of null. Een verlopen of ongeldig concept wordt meteen gewist,
 * zodat het niet blijft liggen. `today` (Amsterdamse dag) laat een datum in het verleden afvallen.
 */
export async function haalConceptVoorGebruiker(userId: string, now = Date.now(), today = ""): Promise<KlusConcept | null> {
  const sleutel = klusConceptSleutel(userId);
  const bewaard = await kvGet<unknown>(sleutel);
  if (bewaard === null || bewaard === undefined) return null;
  const concept = parseConcept(JSON.stringify(bewaard), now, today);
  if (!concept) await kvDelete(sleutel).catch(() => undefined);
  return concept;
}

export async function wisConceptVoorGebruiker(userId: string): Promise<void> {
  await kvDelete(klusConceptSleutel(userId));
}
