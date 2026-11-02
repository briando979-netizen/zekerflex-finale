import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { FiscalBoard } from "@/components/admin/FiscalBoard";

export const dynamic = "force-dynamic";

export default async function AdminFiscaalPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Fiscale gegevens (btw- en KVK-nummers) zijn alleen zichtbaar voor platformbeheerders." />;
  }
  return <FiscalBoard />;
}
