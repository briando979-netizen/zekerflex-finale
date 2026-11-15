import type { HorecaZaak } from "@prisma/client";
import { getPrincipal } from "@/lib/auth";
import { zaakVanTenant } from "@/lib/horeca/store";
import { dashboardVan, mededelingenVoor, type Mededeling, type Medewerker, type PersoneelsDashboard } from "@/lib/horeca-personeel/model";
import { leesPersoneelVan, verwijzingVan } from "@/lib/horeca-personeel/store";

// Wie is deze ingelogde persoon als medewerker van een horecazaak? Een medewerker heeft een gewoon account zonder rol in
// ZekerFlex; alleen de verwijzing horeca:medewerker:<userId> en een actieve regel in de lijst van de beheerder maken hem
// medewerker. Stopt de beheerder hem, dan is die regel gestopt en geeft deze functie niets meer terug.

export interface MedewerkerContext {
  userId: string;
  naam: string;
  tenantId: string;
  zaak: HorecaZaak;
  medewerker: Medewerker;
  dashboard: PersoneelsDashboard;
  mededelingen: Mededeling[];
}

export async function medewerkerContext(): Promise<MedewerkerContext | null> {
  const p = await getPrincipal();
  if (!p) return null;
  const v = await verwijzingVan(p.userId);
  if (!v) return null;
  const [d, zaak] = await Promise.all([leesPersoneelVan(v.tenantId), zaakVanTenant(v.tenantId)]);
  if (!zaak) return null;
  const medewerker = d.medewerkers.find((m) => m.id === v.medewerkerId);
  if (!medewerker || medewerker.status !== "actief" || medewerker.userId !== p.userId) return null;
  const dashboard = dashboardVan(d, medewerker.dashboardId);
  if (!dashboard) return null;
  return { userId: p.userId, naam: medewerker.naam, tenantId: v.tenantId, zaak, medewerker, dashboard, mededelingen: mededelingenVoor(d, dashboard.id) };
}

/** Alleen het antwoord op "is dit een medewerker van een zaak?", voor de doorverwijzing na het inloggen. */
export async function isMedewerker(userId: string): Promise<boolean> {
  return (await verwijzingVan(userId)) !== null;
}
