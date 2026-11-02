import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { Studio } from "@/components/admin/Studio";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De Studio is alleen voor platformbeheerders." />;
  }
  return <Studio />;
}
