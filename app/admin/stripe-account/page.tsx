import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { StripeAccountWissel } from "@/components/admin/StripeAccountWissel";

export const dynamic = "force-dynamic";

export default async function StripeAccountPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het Stripe-account is alleen beschikbaar voor platformbeheerders." />;
  }
  return <StripeAccountWissel />;
}
