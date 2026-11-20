import { cookies } from "next/headers";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { cookieStringIsApp } from "@/lib/app-mode";
import { huidigAbonnement, planRegels, uitbreidingen } from "@/lib/abonnement/overzicht";
import { AbonnementScherm } from "@/components/werkgever/AbonnementScherm";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";

export const dynamic = "force-dynamic";

// Werkgever → Abonnement en uitbreidingen. Bereikbaar via Instellingen; het menu-item hangt aan het
// dashboardskelet (lib/werkgever/werkruimte.ts), niet aan deze pagina.
export default async function AbonnementPage() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const rij = tenantId ? await prisma.apiSubscription.findUnique({ where: { tenantId }, select: { planKey: true, status: true, currentPeriodEnd: true } }) : null;
  const huidig = huidigAbonnement(rij);
  const inApp = cookieStringIsApp((await cookies()).toString());
  // vlag `publiek-alleen-flexwerk`: dan alleen de flexwerk-uitbreidingen en geen SaaS-pakketten (prijs per gewerkt uur)
  const alleenFlexwerk = await alleenFlexwerkAan().catch(() => false);
  return <AbonnementScherm huidig={huidig} plannen={planRegels(huidig, alleenFlexwerk)} groepen={uitbreidingen(alleenFlexwerk)} inApp={inApp} />;
}
