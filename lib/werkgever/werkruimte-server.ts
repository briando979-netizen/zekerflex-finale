import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { siteOfTenant } from "@/lib/sites/store";
import { bepaalWerkruimte, leesKeuze, type Werkruimte, type WerkruimteKeuze, type WerkruimteStand } from "@/lib/werkgever/werkruimte";

// ---------------------------------------------------------------------------
// De werkruimte van een bedrijf ophalen en bewaren (lib/werkgever/werkruimte.ts).
//   KV "werkruimte:<tenantId>" — de keuze van het bedrijf (geen persoonsgegevens)
// Elke bron los en foutbestendig: een ontbrekende tabel of een storing mag het
// menu nooit breken; dan valt het terug op het gewone dashboard.
// ---------------------------------------------------------------------------

const sleutel = (tenantId: string) => `werkruimte:${tenantId}`;

export interface WerkruimteContext extends WerkruimteStand {
  heeftRijschool: boolean;
  heeftHoreca: boolean;
  heeftSite: boolean;
  heeftKlussen: boolean;
}

const GEWOON: WerkruimteContext = {
  soort: "personeel",
  ookPersoneel: true,
  gekozen: false,
  heeftRijschool: false,
  heeftHoreca: false,
  heeftSite: false,
  heeftKlussen: false,
};

/** Per verzoek één keer: de layout en het startscherm vragen hetzelfde. */
export const werkruimteVan = cache(async (tenantId: string | undefined): Promise<WerkruimteContext> => {
  if (!tenantId) return GEWOON;
  const [keuze, rijschool, horeca, site, klus] = await Promise.all([
    kvGet<unknown>(sleutel(tenantId)).then(leesKeuze).catch(() => null),
    prisma.rijschool.findUnique({ where: { tenantId }, select: { id: true } }).catch(() => null),
    prisma.horecaZaak.findUnique({ where: { tenantId }, select: { modules: true } }).catch(() => null),
    siteOfTenant(tenantId).catch(() => null),
    prisma.shift.findFirst({ where: { branch: { tenantId } }, select: { id: true } }).catch(() => null),
  ]);
  const feiten = {
    keuze,
    heeftRijschool: Boolean(rijschool),
    heeftHoreca: Boolean(horeca),
    heeftSite: Boolean(site),
    heeftKlussen: Boolean(klus),
    personeelModule: horeca?.modules.includes("personeel") ?? false,
  };
  return { ...bepaalWerkruimte(feiten), heeftRijschool: feiten.heeftRijschool, heeftHoreca: feiten.heeftHoreca, heeftSite: feiten.heeftSite, heeftKlussen: feiten.heeftKlussen };
});

export async function bewaarWerkruimte(tenantId: string, soort: Werkruimte, ookPersoneel: boolean): Promise<WerkruimteKeuze> {
  const keuze: WerkruimteKeuze = { soort, ookPersoneel, at: new Date().toISOString() };
  await kvSet(sleutel(tenantId), keuze);
  return keuze;
}
