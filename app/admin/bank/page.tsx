import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { AdminBankView } from "@/components/bank/AdminBankView";

export const dynamic = "force-dynamic";

export default async function AdminBankPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Geen toegang" subtitle="ZekerFlex Bank-beheer is alleen voor platformbeheerders." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl">
      <AdminBankView />
    </div>
  );
}
