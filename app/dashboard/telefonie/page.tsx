import Link from "next/link";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { linesOf, pricingFor } from "@/lib/telephony/lines";
import { freeAccess } from "@/lib/billing/comp";
import { Telefonie } from "@/components/app/Telefonie";

export const dynamic = "force-dynamic";

export default async function MyNumberPage() {
  const principal = await requirePrincipal();
  const free = await freeAccess(principal);
  const [pricing, lines] = await Promise.all([pricingFor(free), linesOf("persoonlijk", principal.userId)]);
  return (
    <>
      <div className="mb-6">
        <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← Terug
        </Link>
      </div>
      <Telefonie scope="persoonlijk" pricing={pricing} free={free} initialLines={lines} canRequest={hasRole(principal, "FREELANCER", "PLATFORM_ADMIN")} />
    </>
  );
}
