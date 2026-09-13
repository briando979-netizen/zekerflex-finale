import type { Metadata } from "next";
import { ShopStorefront } from "@/components/marketing/ShopStorefront";

export const metadata: Metadata = {
  title: "ZekerFlex Shop — werkkleding, PBM & werkdag-essentials",
  description:
    "Gecertificeerde veiligheidsschoenen, handschoenen, helmen en werkkleding. Voor 22:00 besteld, morgen in huis. Zakelijk bestellen op rekening.",
  alternates: { canonical: "/shop" },
};

export const dynamic = "force-dynamic";

const CATS = ["Alles", "Werk & PBM", "Kleding", "Werkdag", "Cadeaus"] as const;
type Cat = (typeof CATS)[number];

export default async function ShopPage(props: { searchParams: Promise<{ cat?: string }> }) {
  const searchParams = await props.searchParams;
  const initialCat: Cat = CATS.includes(searchParams.cat as Cat) ? (searchParams.cat as Cat) : "Alles";
  return <ShopStorefront initialCat={initialCat} />;
}
