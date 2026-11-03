import { notFound, redirect } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { huidigeInstructeur, huidigeLeerling } from "@/lib/rijschool/accounts";

export const dynamic = "force-dynamic";

// Het beginadres van de Android-app en van de app op het beginscherm: wie al
// ingelogd is gaat meteen naar zijn eigen app, de rest naar inloggen.
export default async function AppStartPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  if (await huidigeLeerling(r)) redirect(`/rijschool/${r.slug}/leerling`);
  if (await huidigeInstructeur(r)) redirect(`/rijschool/${r.slug}/instructeur`);
  redirect(`/rijschool/${r.slug}/inloggen`);
}
