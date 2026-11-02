import { getPrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getPricing, linesOf } from "@/lib/telephony/lines";
import { Telefonie } from "@/components/app/Telefonie";

export const dynamic = "force-dynamic";

export default async function TelefoniePage() {
  // Toegang is al afgedwongen in app/werkgever/layout.tsx.
  const principal = await getPrincipal();
  const tenantId = principal ? (await resolveEmployerScope(principal)).tenantIds[0] : undefined;
  const [pricing, lines] = await Promise.all([getPricing(), tenantId ? linesOf("bedrijf", tenantId) : Promise.resolve([])]);
  return (
    <Telefonie
      scope="bedrijf"
      pricing={pricing}
      initialLines={lines}
      canRequest={Boolean(principal && tenantId && hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN"))}
    />
  );
}
