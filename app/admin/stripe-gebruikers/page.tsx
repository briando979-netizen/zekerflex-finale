import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead, Panel, Empty, KpiStrip, Pill } from "@/components/admin/kit";
import { StripeUsersPanel } from "@/components/admin/StripeUsersPanel";

export const dynamic = "force-dynamic";

export default async function AdminStripeGebruikersPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <PageHead
        title="Geen toegang"
        subtitle="Stripe gebruikersgegevens zijn alleen voor platformbeheerders."
      />
    );
  }

  return (
    <>
      <PageHead
        title="Stripe gebruikers"
        subtitle="Verificatie- en identiteitsgegevens van gebruikers uit Stripe"
      />
      <StripeUsersPanel />
    </>
  );
}
