import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { DomeinBestellingen } from "@/components/admin/DomeinBestellingen";

export const dynamic = "force-dynamic";

// Admin → Domeinen: bestelde domeinnamen registreren en afvinken (lib/domeinen/bestelling.ts).
export default async function DomeinenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Domeinen is alleen beschikbaar voor platformbeheerders." />;
  }
  return <DomeinBestellingen />;
}
