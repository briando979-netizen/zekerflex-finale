import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FunctieLanding } from "@/components/marketing/FunctieLanding";
import { FUNCTIES, functieBySlug, functieMetadata } from "@/lib/seo-functies";

export const dynamicParams = false;

export function generateStaticParams() {
  return FUNCTIES.map((f) => ({ functie: f.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ functie: string }> }): Promise<Metadata> {
  const f = functieBySlug((await params).functie);
  return f ? functieMetadata(f) : {};
}

export default async function Page({ params }: { params: Promise<{ functie: string }> }) {
  const f = functieBySlug((await params).functie);
  if (!f) notFound();
  return <FunctieLanding functie={f} />;
}
