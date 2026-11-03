import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { GooglePlayBeheer } from "@/components/admin/GooglePlayBeheer";

export const dynamic = "force-dynamic";

export default async function GooglePlayPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Google Play is alleen beschikbaar voor platformbeheerders." />;
  }
  return <GooglePlayBeheer />;
}
