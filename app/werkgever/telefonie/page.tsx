import { getPrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { linesOf, pricingFor } from "@/lib/telephony/lines";
import { freeAccess } from "@/lib/billing/comp";
import { Telefonie } from "@/components/app/Telefonie";

export const dynamic = "force-dynamic";

export default async function TelefoniePage() {
  // Toegang is al afgedwongen in app/werkgever/layout.tsx.
  const principal = await getPrincipal();
  const tenantId = principal ? (await resolveEmployerScope(principal)).tenantIds[0] : undefined;
  const free = await freeAccess(principal);
  const [pricing, lines] = await Promise.all([pricingFor(free), tenantId ? linesOf("bedrijf", tenantId) : Promise.resolve([])]);
  return (
    <Telefonie
      scope="bedrijf"
      pricing={pricing}
      free={free}
      initialLines={lines}
      canRequest={Boolean(principal && tenantId && hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN"))}
    />
  );
}
