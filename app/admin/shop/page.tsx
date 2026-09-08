import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { ShopAdmin } from "@/components/admin/ShopAdmin";

export const dynamic = "force-dynamic";

export default async function ShopAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHeader title="Geen toegang" subtitle="Webshopbeheer is alleen voor platformbeheerders." />;
  }
  return <ShopAdmin />;
}
