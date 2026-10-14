import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { ShopStorefront } from "@/components/marketing/ShopStorefront";

const title = "ZekerFlex Shop — werkkleding, PBM & werkdag-essentials";
const description =
  "Gecertificeerde veiligheidsschoenen, handschoenen, helmen en werkkleding. Voor 22:00 besteld, morgen in huis. Zakelijk bestellen op rekening.";

export const metadata: Metadata = {
  title,
  description,
  ...canonical("/shop", { title, description }),
};

export const dynamic = "force-dynamic";

const CATS = ["Alles", "Werk & PBM", "Kleding", "Werkdag", "Cadeaus"] as const;
type Cat = (typeof CATS)[number];

export default async function ShopPage(props: { searchParams: Promise<{ cat?: string }> }) {
  const searchParams = await props.searchParams;
  const initialCat: Cat = CATS.includes(searchParams.cat as Cat) ? (searchParams.cat as Cat) : "Alles";
  return <ShopStorefront initialCat={initialCat} />;
}
