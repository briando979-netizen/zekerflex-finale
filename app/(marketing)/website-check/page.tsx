import type { Metadata } from "next";
import { WebsiteCheck, type PlanCard } from "@/components/marketing/WebsiteCheck";
import { getWebsiteCheck } from "@/lib/website-check/run";
import { getScanLog } from "@/lib/scans/store";
import { WEBSITE_PLANS } from "@/lib/website/manage";
import { euro } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Gratis website-check",
  description:
    "Check gratis hoe snel, vindbaar in Google en veilig je website is. Binnen een halve minuut een rapport in gewone taal, met wat je kunt verbeteren.",
  alternates: { canonical: "/website-check" },
};

export const dynamic = "force-dynamic";

const PLANS: PlanCard[] = (["basis", "pro"] as const).map((key) => ({
  key,
  label: WEBSITE_PLANS[key].label,
  price: euro(WEBSITE_PLANS[key].priceCentsPerMonth),
  blurb: WEBSITE_PLANS[key].blurb,
  features: WEBSITE_PLANS[key].features,
}));

export default async function WebsiteCheckPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const initial = r ? await getWebsiteCheck(r) : null;
  // het voorstel op maat bij deze check, als die er is (lib/scans)
  const log = initial ? await getScanLog("website", initial.id) : null;
  return <WebsiteCheck initial={initial} plans={PLANS} initialDealId={log?.dealId ?? null} />;
}
