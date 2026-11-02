import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { CompAccountsAdmin } from "@/components/admin/CompAccountsAdmin";

export const dynamic = "force-dynamic";

export default async function KostelozeAccountsPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Kosteloze accounts zijn alleen beschikbaar voor platformbeheerders." />;
  }
  return <CompAccountsAdmin />;
}
