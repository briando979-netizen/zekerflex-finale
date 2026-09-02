import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { FiscalBoard } from "@/components/admin/FiscalBoard";

export const dynamic = "force-dynamic";

export default async function AdminFiscaalPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Geen toegang"
          subtitle="Fiscale gegevens (btw-/KVK-nummers) zijn alleen zichtbaar voor platformbeheerders."
        />
      </div>
    );
  }
  return <FiscalBoard />;
}
