import { getPrincipal } from "@/lib/auth";
import { env } from "@/lib/env";
import { SalesProposals } from "@/components/sales/SalesProposals";

export const dynamic = "force-dynamic";

// The sales layout already lets in SALES and PLATFORM_ADMIN only.
export default async function SalesWebsitevoorstellenPage() {
  const principal = await getPrincipal();
  return <SalesProposals origin={new URL(env.APP_BASE_URL).origin} me={principal?.fullName || principal?.email || "ZekerFlex"} />;
}
