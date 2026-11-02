import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { AdsStudio } from "@/components/admin/AdsStudio";

export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De advertentiegenerator is alleen beschikbaar voor platformbeheerders." />;
  }
  return <AdsStudio />;
}
