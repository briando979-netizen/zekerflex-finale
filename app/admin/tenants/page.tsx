import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHead } from "@/components/admin/kit";
import { TenancyBoard } from "@/components/admin/TenancyBoard";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="White-label is alleen voor platformbeheerders." />;
  }
  const tenants = await prisma.tenant.findMany({
    where: { type: { not: "PLATFORM" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  return (
    <div className="space-y-4">
      <PageHead
        title="Klanten & white-label"
        subtitle="Host andere bureaus onder je platform: koppel per klant een adres aan hun organisatie en merk. Dit is de basis. Branding per adres toepassen en data per klant afschermen bouwen hierop voort."
      />
      <TenancyBoard tenants={tenants} />
    </div>
  );
}
