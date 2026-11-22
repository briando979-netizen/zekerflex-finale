import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VraagLanding } from "@/components/marketing/VraagLanding";
import { BEDRIJFS_VRAGEN, vraagBySlug, vraagMetadata } from "@/lib/seo-vragen";

export const dynamicParams = false;

export function generateStaticParams() {
  return BEDRIJFS_VRAGEN.map((v) => ({ vraag: v.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ vraag: string }> }): Promise<Metadata> {
  const v = vraagBySlug((await params).vraag);
  return v ? vraagMetadata(v) : {};
}

export default async function Page({ params }: { params: Promise<{ vraag: string }> }) {
  const v = vraagBySlug((await params).vraag);
  if (!v) notFound();
  return <VraagLanding vraag={v} />;
}
