import Link from "next/link";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { linesOf, pricingFor } from "@/lib/telephony/lines";
import { freeAccess } from "@/lib/billing/comp";
import { Telefonie } from "@/components/app/Telefonie";
import { TELEFONIE_TEKSTEN } from "@/lib/telephony/teksten";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function MyNumberPage() {
  const principal = await requirePrincipal();
  const free = await freeAccess(principal);
  const tx = TELEFONIE_TEKSTEN[await getLocale()];
  const [pricing, lines] = await Promise.all([pricingFor(free), linesOf("persoonlijk", principal.userId)]);
  return (
    <>
      <div className="mb-6">
        <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          {tx.terug}
        </Link>
      </div>
      <Telefonie scope="persoonlijk" pricing={pricing} free={free} initialLines={lines} canRequest={hasRole(principal, "FREELANCER", "PLATFORM_ADMIN")} texts={tx} />
    </>
  );
}
