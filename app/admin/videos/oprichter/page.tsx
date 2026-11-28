import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { OprichterScherm } from "@/components/admin/OprichterScherm";

export const dynamic = "force-dynamic";

// Beheer → Videos → Oprichter: het storyboard van de oprichtersvideo (timing, tekst en beeldsuggesties per clip).
// Het scherm zelf is een clientcomponent (components/admin/OprichterScherm.tsx); deze pagina is de serverkant en doet
// de afscherming. Elke beheerpagina is strikt PLATFORM_ADMIN (tests/admin-access.test.ts bewaakt dat).
export default async function OprichterVideoPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het oprichter-videoscript is alleen voor platformbeheerders." />;
  }
  return <OprichterScherm />;
}
