import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { ZfMailAdmin } from "@/components/admin/ZfMailAdmin";

export const dynamic = "force-dynamic";

export default async function ZfMailAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="ZekerFlex Mail is alleen beschikbaar voor platformbeheerders." />;
  }
  return <ZfMailAdmin />;
}
