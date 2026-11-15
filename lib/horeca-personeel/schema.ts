import { z } from "zod";
import { BLOKKEN, MAX_DASHBOARDS, MAX_MEDEDELINGEN, MAX_MEDEWERKERS, MAX_TEKST, MEDEWERKER_STATUSSEN, type PersoneelData } from "@/lib/horeca-personeel/model";

// Het inlezen van de personeelsgegevens met controle (lib/horeca/personeel/model.ts): een opgeslagen of binnengekomen waarde
// die niet klopt, geeft null en wordt dus nooit half gebruikt.

const id = z.string().min(1).max(40);
const kort = z.string().trim().min(1).max(60);

const dashboardSchema = z.object({
  id,
  naam: kort,
  blokken: z.array(z.enum(BLOKKEN)).max(BLOKKEN.length),
});

const medewerkerSchema = z.object({
  id,
  naam: kort,
  email: z.string().trim().toLowerCase().email().max(200),
  functie: z.string().trim().max(60),
  dashboardId: id,
  status: z.enum(MEDEWERKER_STATUSSEN),
  userId: z.string().min(1).max(80).nullable(),
  uitgenodigd: z.string().max(40),
});

const mededelingSchema = z.object({
  id,
  tekst: z.string().trim().min(1).max(MAX_TEKST),
  datum: z.string().max(40),
  dashboardIds: z.array(id).max(MAX_DASHBOARDS),
});

export const personeelSchema = z.object({
  versie: z.literal(1),
  dashboards: z.array(dashboardSchema).max(MAX_DASHBOARDS),
  medewerkers: z.array(medewerkerSchema).max(MAX_MEDEWERKERS),
  mededelingen: z.array(mededelingSchema).max(MAX_MEDEDELINGEN),
});

export function leesPersoneel(ruw: unknown): PersoneelData | null {
  const r = personeelSchema.safeParse(ruw);
  return r.success ? r.data : null;
}
