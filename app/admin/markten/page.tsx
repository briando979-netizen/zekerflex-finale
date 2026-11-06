import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { Agenten } from "@/components/admin/Agenten";

export const dynamic = "force-dynamic";

export default async function AgentenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De agenten zijn alleen voor platformbeheerders." />;
  }
  return <Agenten />;
}
