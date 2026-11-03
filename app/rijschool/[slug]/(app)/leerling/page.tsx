import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { huidigeLeerling } from "@/lib/rijschool/accounts";
import { leerlingWeergave } from "@/lib/rijschool/weergave";
import { LeerlingApp } from "@/components/rijschool/leerling/LeerlingApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mijn lessen", robots: { index: false, follow: false } };

export default async function LeerlingPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const leerling = await huidigeLeerling(r);
  if (!leerling) redirect(`/rijschool/${r.slug}/inloggen`);
  return <LeerlingApp slug={r.slug} begin={await leerlingWeergave(r, leerling)} />;
}
