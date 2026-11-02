import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { Beller } from "@/components/admin/Beller";

export const dynamic = "force-dynamic";

export default async function BellerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De AI-beller is alleen beschikbaar voor platformbeheerders." />;
  }
  return <Beller />;
}
