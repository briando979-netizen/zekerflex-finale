import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { Newsletter } from "@/components/admin/Newsletter";

export const dynamic = "force-dynamic";

export default async function NieuwsbriefPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Geen toegang" subtitle="De nieuwsbrief is alleen voor platformbeheerders." />
      </div>
    );
  }
  return <Newsletter />;
}
