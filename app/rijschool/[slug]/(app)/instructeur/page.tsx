import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { huidigeInstructeur } from "@/lib/rijschool/accounts";
import { instructeurWeergave } from "@/lib/rijschool/weergave";
import { InstructeurApp } from "@/components/rijschool/instructeur/InstructeurApp";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Instructeur", robots: { index: false, follow: false } };

export default async function InstructeurPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const instructeur = await huidigeInstructeur(r);
  if (!instructeur) redirect(`/rijschool/${r.slug}/inloggen?soort=instructeur`);
  return <InstructeurApp slug={r.slug} begin={await instructeurWeergave(r, instructeur, amsterdamDayKey(new Date()))} />;
}
