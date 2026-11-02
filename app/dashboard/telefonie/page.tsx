import Link from "next/link";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { getPricing, linesOf } from "@/lib/telephony/lines";
import { Telefonie } from "@/components/app/Telefonie";

export const dynamic = "force-dynamic";

export default async function MyNumberPage() {
  const principal = await requirePrincipal();
  const [pricing, lines] = await Promise.all([getPricing(), linesOf("persoonlijk", principal.userId)]);
  return (
    <>
      <div className="mb-6">
        <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← Terug
        </Link>
      </div>
      <Telefonie scope="persoonlijk" pricing={pricing} initialLines={lines} canRequest={hasRole(principal, "FREELANCER", "PLATFORM_ADMIN")} />
    </>
  );
}
