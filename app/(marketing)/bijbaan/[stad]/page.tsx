import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CITIES, cityBySlug } from "@/lib/seo-cities";
import { BijbaanStad } from "@/components/marketing/BijbaanLanding";
import { bijbaanStadMetadata } from "@/lib/seo-bijbaan";

export const dynamicParams = false;

export function generateStaticParams() {
  return CITIES.map((c) => ({ stad: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ stad: string }> }): Promise<Metadata> {
  const c = cityBySlug((await params).stad);
  return c ? bijbaanStadMetadata(c) : {};
}

export default async function Page({ params }: { params: Promise<{ stad: string }> }) {
  const c = cityBySlug((await params).stad);
  if (!c) notFound();
  return <BijbaanStad city={c} />;
}
