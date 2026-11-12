import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { AccountantHub } from "@/components/admin/accountant/AccountantHub";

export const dynamic = "force-dynamic";

// Admin → Financiën → Accountant: structuurcheck, Delaware franchise tax en een vraagbalk met bronnen.
export default async function AccountantPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De accountant is alleen beschikbaar voor platformbeheerders." />;
  }
  return <AccountantHub />;
}
