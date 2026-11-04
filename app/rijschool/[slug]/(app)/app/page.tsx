import { notFound, redirect } from "next/navigation";
import { laadRijschool, linkBasis } from "@/lib/rijschool/pagina";
import { sitePad } from "@/lib/rijschool/domein-pad";
import { huidigeInstructeur, huidigeLeerling } from "@/lib/rijschool/accounts";

export const dynamic = "force-dynamic";

// Het beginadres van de Android-app en van de app op het beginscherm: wie al
// ingelogd is gaat meteen naar zijn eigen app, de rest naar inloggen.
export default async function AppStartPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const basis = await linkBasis(r.id, r.slug);
  if (await huidigeLeerling(r)) redirect(sitePad(basis, "/leerling"));
  if (await huidigeInstructeur(r)) redirect(sitePad(basis, "/instructeur"));
  redirect(sitePad(basis, "/inloggen"));
}
