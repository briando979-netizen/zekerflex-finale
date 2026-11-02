import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { TelefonieAdmin } from "@/components/admin/TelefonieAdmin";

export const dynamic = "force-dynamic";

export default async function TelefonieAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Telefonie is alleen beschikbaar voor platformbeheerders." />;
  }
  return <TelefonieAdmin />;
}
