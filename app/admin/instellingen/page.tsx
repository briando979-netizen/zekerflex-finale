import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { SettingsPanel } from "@/components/admin/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function AdminInstellingenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <PageHead
        title="Geen toegang"
        subtitle="Platform-instellingen zijn alleen voor platformbeheerders."
      />
    );
  }

  return (
    <>
      <PageHead
        title="Platform-instellingen"
        subtitle="Basisconfiguratie van het platform"
      />
      <SettingsPanel />
    </>
  );
}
