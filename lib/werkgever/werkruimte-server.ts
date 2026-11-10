import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { siteOfTenant } from "@/lib/sites/store";
import { bepaalWerkruimte, isWerkruimte, leesKeuze, voegToe, WERKRUIMTES, type Werkruimte, type WerkruimteKeuze, type WerkruimteStand } from "@/lib/werkgever/werkruimte";

// ---------------------------------------------------------------------------
// De dashboards van een bedrijf ophalen en bewaren (lib/werkgever/werkruimte.ts).
//   KV "werkruimte:<tenantId>"  — welke dashboards het bedrijf toevoegde en waarmee het opent
//                                 (bedrijfsgegevens, geen persoonsgegevens)
//   cookie "zf_dashboard"       — welk dashboard deze browser het laatst open had; wisselen
//                                 verandert dus niets voor collega's
// Elke bron los en foutbestendig: een ontbrekende tabel of een storing mag het menu nooit breken;
// dan valt het terug op het gewone dashboard.
// ---------------------------------------------------------------------------

const sleutel = (tenantId: string) => `werkruimte:${tenantId}`;

/** Het dashboard dat deze browser open heeft (gezet door POST /api/werkgever/dashboard/wissel). */
export const DASHBOARD_COOKIE = "zf_dashboard";

export interface WerkruimteContext extends WerkruimteStand {
  heeftRijschool: boolean;
  heeftHoreca: boolean;
  heeftSite: boolean;
  heeftWebshop: boolean;
  heeftKlussen: boolean;
  /** de modules van de horecazaak (lib/horeca/modules.ts); leeg zonder zaak */
  horecaModules: string[];
}

const GEWOON: WerkruimteContext = {
  soort: "personeel",
  ookPersoneel: true,
  gekozen: false,
  dashboards: ["personeel"],
  heeftRijschool: false,
  heeftHoreca: false,
  heeftSite: false,
  heeftWebshop: false,
  heeftKlussen: false,
  horecaModules: [],
};

async function gewenstDashboard(): Promise<Werkruimte | null> {
  try {
    const waarde = (await cookies()).get(DASHBOARD_COOKIE)?.value;
    return isWerkruimte(waarde) ? waarde : null;
  } catch {
    return null;
  }
}

/** Per verzoek één keer: de layout en het startscherm vragen hetzelfde. */
export const werkruimteVan = cache(async (tenantId: string | undefined): Promise<WerkruimteContext> => {
  if (!tenantId) return GEWOON;
  const [keuze, rijschool, horeca, site, webshop, klus, gewenst] = await Promise.all([
    kvGet<unknown>(sleutel(tenantId)).then(leesKeuze).catch(() => null),
    prisma.rijschool.findUnique({ where: { tenantId }, select: { id: true } }).catch(() => null),
    prisma.horecaZaak.findUnique({ where: { tenantId }, select: { modules: true } }).catch(() => null),
    siteOfTenant(tenantId, "website").catch(() => null),
    siteOfTenant(tenantId, "webshop").catch(() => null),
    prisma.shift.findFirst({ where: { branch: { tenantId } }, select: { id: true } }).catch(() => null),
    gewenstDashboard(),
  ]);
  const feiten = {
    keuze,
    heeftRijschool: Boolean(rijschool),
    heeftHoreca: Boolean(horeca),
    heeftSite: Boolean(site),
    heeftWebshop: Boolean(webshop),
    heeftKlussen: Boolean(klus),
    personeelModule: horeca?.modules.includes("personeel") ?? false,
  };
  return {
    ...bepaalWerkruimte(feiten, gewenst),
    heeftRijschool: feiten.heeftRijschool,
    heeftHoreca: feiten.heeftHoreca,
    heeftSite: feiten.heeftSite,
    heeftWebshop: feiten.heeftWebshop,
    heeftKlussen: feiten.heeftKlussen,
    horecaModules: horeca?.modules ?? [],
  };
});

/**
 * Een dashboard aan het bedrijf toevoegen (bij het aanmelden, of "Dashboard toevoegen"); het wordt
 * het dashboard waarmee het bedrijf opent. `ook` voegt er nog meer toe (bijv. personeel).
 */
export async function voegDashboardToe(tenantId: string, soort: Werkruimte, ook: readonly Werkruimte[] = [], now = new Date()): Promise<WerkruimteKeuze> {
  const oud = await kvGet<unknown>(sleutel(tenantId)).then(leesKeuze).catch(() => null);
  const keuze = voegToe(oud, soort, now.toISOString());
  const lijst = new Set<Werkruimte>([...keuze.dashboards, ...ook]);
  const nieuw: WerkruimteKeuze = { ...keuze, ookPersoneel: lijst.has("personeel"), dashboards: WERKRUIMTES.filter((w) => lijst.has(w)) };
  await kvSet(sleutel(tenantId), nieuw);
  return nieuw;
}

/** Cookie-instellingen voor het open dashboard: een jaar, alleen voor de server. */
export function dashboardCookie(soort: Werkruimte): { name: string; value: string; path: string; maxAge: number; sameSite: "lax"; httpOnly: true; secure: boolean } {
  return { name: DASHBOARD_COOKIE, value: soort, path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" };
}
