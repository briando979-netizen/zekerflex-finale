import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { Studio } from "@/components/admin/Studio";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Geen toegang" subtitle="De Studio is alleen voor platformbeheerders." />
      </div>
    );
  }
  return <Studio />;
}
