import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { Offertes } from "@/components/admin/Offertes";

export const dynamic = "force-dynamic";

export default async function OffertesPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De offerte-AI is alleen beschikbaar voor platformbeheerders." />;
  }
  return <Offertes />;
}
