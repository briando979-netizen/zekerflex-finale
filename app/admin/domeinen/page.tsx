import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { DomeinBestellingen } from "@/components/admin/DomeinBestellingen";
import { env } from "@/lib/env";
import { transipConfigured } from "@/lib/mail/hosting/transip";

export const dynamic = "force-dynamic";

// Admin → Domeinen: bestelde domeinnamen registreren en afvinken (lib/domeinen/bestelling.ts).
export default async function DomeinenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Domeinen is alleen beschikbaar voor platformbeheerders." />;
  }
  return <DomeinBestellingen transip={transipConfigured()} ipv4={env.SITES_IPV4} ipv6={env.SITES_IPV6} />;
}
