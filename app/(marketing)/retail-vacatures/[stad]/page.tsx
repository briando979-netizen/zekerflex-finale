import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CITIES, cityBySlug } from "@/lib/seo-cities";
import { sectorBySlug } from "@/lib/seo-sectors";
import { SectorWorkerCity, sectorWorkerCityMetadata } from "@/components/marketing/SectorLanding";

const sector = sectorBySlug("retail-personeel-inhuren")!;
export const dynamicParams = false;

export function generateStaticParams() {
  return CITIES.map((c) => ({ stad: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ stad: string }> }): Promise<Metadata> {
  const c = cityBySlug((await params).stad);
  return c ? sectorWorkerCityMetadata(sector, c) : {};
}

export default async function Page({ params }: { params: Promise<{ stad: string }> }) {
  const c = cityBySlug((await params).stad);
  if (!c) notFound();
  return <SectorWorkerCity sector={sector} city={c} />;
}
