import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { UitzendConsole } from "@/components/admin/UitzendConsole";

export const dynamic = "force-dynamic";

export default async function UitzendbureauAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het uitzendbureau-overzicht is alleen voor platformbeheerders." />;
  }
  return <UitzendConsole />;
}
