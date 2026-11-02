import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { Newsletter } from "@/components/admin/Newsletter";

export const dynamic = "force-dynamic";

export default async function NieuwsbriefPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De nieuwsbrief is alleen voor platformbeheerders." />;
  }
  return <Newsletter />;
}
