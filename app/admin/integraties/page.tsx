import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/ui";
import { ApiKeysBoard } from "@/components/admin/ApiKeysBoard";
import { WebhooksBoard } from "@/components/admin/WebhooksBoard";

export const dynamic = "force-dynamic";

export default async function IntegratiesPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Geen toegang" subtitle="API-sleutels zijn alleen voor platformbeheerders." />
      </div>
    );
  }

  const tenants = await prisma.tenant.findMany({
    where: { type: { not: "PLATFORM" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 300,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <ApiKeysBoard tenants={tenants} />
      <WebhooksBoard />
    </div>
  );
}
