import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { Cockpit } from "@/components/admin/Cockpit";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Geen toegang" subtitle="De cockpit is alleen voor platformbeheerders." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl">
      <Cockpit />
    </div>
  );
}
