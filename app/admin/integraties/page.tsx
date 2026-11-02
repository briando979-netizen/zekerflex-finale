import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHead } from "@/components/admin/kit";
import { ApiKeysBoard } from "@/components/admin/ApiKeysBoard";
import { WebhooksBoard } from "@/components/admin/WebhooksBoard";

export const dynamic = "force-dynamic";

export default async function IntegratiesPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="API-sleutels zijn alleen voor platformbeheerders." />;
  }
  const tenants = await prisma.tenant.findMany({
    where: { type: { not: "PLATFORM" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 300,
  });
  return (
    <div className="space-y-8">
      <ApiKeysBoard tenants={tenants} />
      <WebhooksBoard />
    </div>
  );
}
