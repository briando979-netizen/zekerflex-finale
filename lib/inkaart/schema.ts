import { z } from "zod";
import { MAX_GROEPEN, MAX_RUIMTES_PER_REGEL, MAX_RUIMTE_REGELS, RASTER_LENGTE, SOORTEN, type BedrijfInKaart } from "@/lib/inkaart/model";

// Het inlezen met controle van "Bedrijf in kaart" (server): wat de pagina instuurt en wat in de opslag staat. De browser importeert dit niet
// (zod), alleen lib/inkaart/model.ts.

const euro = z.number().finite().min(0).max(10_000_000_000).nullable();
const procent = z.number().finite().min(0).max(100).nullable();

export const ruimteSchema = z.object({
  id: z.string().min(1).max(40),
  naam: z.string().trim().min(1).max(80),
  soort: z.string().trim().max(60),
  aantal: z.number().int().min(1).max(MAX_RUIMTES_PER_REGEL),
  m2: z.number().finite().min(0).max(100_000).nullable(),
  plekken: z.number().int().min(0).max(100_000).nullable(),
  afdeling: z.string().trim().max(60),
  verdieping: z.string().trim().max(30),
  bezetting: z.array(procent).length(RASTER_LENGTE),
  notitie: z.string().trim().max(300),
});

export const groepSchema = z.object({
  id: z.string().min(1).max(40),
  naam: z.string().trim().min(1).max(80),
  fte: z.number().finite().min(0).max(100_000),
  kostenJaar: euro,
});

export const bedrijfSchema = z.object({
  versie: z.literal(1),
  bijgewerkt: z.string().max(40),
  soort: z.enum(SOORTEN),
  jaar: z.number().int().min(2000).max(2100),
  omzetJaar: euro,
  personeelskostenJaar: euro,
  huurJaar: euro,
  doelPersoneelPct: procent,
  doelBezettingPct: procent,
  open: z.array(z.boolean()).length(RASTER_LENGTE),
  groepen: z.array(groepSchema).max(MAX_GROEPEN),
  ruimtes: z.array(ruimteSchema).max(MAX_RUIMTE_REGELS),
});

/** Leest bewaarde of ingestuurde gegevens: een geldig bedrijf, of null. Gooit nooit. */
export function leesBedrijf(ruw: unknown): BedrijfInKaart | null {
  const r = bedrijfSchema.safeParse(ruw);
  return r.success ? (r.data satisfies BedrijfInKaart) : null;
}
