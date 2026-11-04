import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { laadRijschool, linkBasis } from "@/lib/rijschool/pagina";
import { sitePad } from "@/lib/rijschool/domein-pad";
import { huidigeInstructeur, huidigeLeerling } from "@/lib/rijschool/accounts";
import { InlogFormulier } from "@/components/rijschool/site/InlogFormulier";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inloggen", robots: { index: false, follow: false } };

export default async function InloggenPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ uitnodiging?: string; soort?: string }>;
}) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const basis = await linkBasis(r.id, r.slug);
  const { uitnodiging, soort } = await searchParams;
  // al ingelogd en geen nieuwe uitnodiging: meteen naar de app
  if (!uitnodiging) {
    if (await huidigeLeerling(r)) redirect(sitePad(basis, "/leerling"));
    if (soort === "instructeur" && (await huidigeInstructeur(r))) redirect(sitePad(basis, "/instructeur"));
  }
  return (
    <div className="mx-auto max-w-md">
      <InlogFormulier slug={r.slug} basis={basis} uitnodiging={uitnodiging && uitnodiging.length <= 200 ? uitnodiging : null} beginSoort={soort === "instructeur" ? "instructeur" : "leerling"} />
    </div>
  );
}
