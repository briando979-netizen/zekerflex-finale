import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { OwnerTodos } from "@/components/admin/OwnerTodos";

export const dynamic = "force-dynamic";

export default async function TeDoenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  return <OwnerTodos />;
}
