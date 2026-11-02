import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { WebsiteBeheer } from "@/components/admin/WebsiteBeheer";

export const dynamic = "force-dynamic";

export default async function WebsiteBeheerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Website-beheer is alleen beschikbaar voor platformbeheerders." />;
  }
  return <WebsiteBeheer />;
}
