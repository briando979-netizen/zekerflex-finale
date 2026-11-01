import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { Cockpit } from "@/components/admin/Cockpit";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De cockpit is alleen voor platformbeheerders." />;
  }
  return <Cockpit />;
}
