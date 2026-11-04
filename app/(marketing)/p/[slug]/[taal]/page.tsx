import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EigenPaginaWeergave, eigenPaginaMetadata, vindEigenPagina } from "@/components/marketing/ontwerp/EigenPagina";
import { isTaal } from "@/lib/ontwerp/paginas";

// Een vertaling van een eigen pagina (Site-ontwerper → Pagina's → Talen), bijvoorbeeld /p/festival-personeel/en.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; taal: string }>; searchParams: Promise<{ concept?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, taal } = await params;
  const { concept } = await searchParams;
  if (!isTaal(taal)) return { title: "Pagina niet gevonden", robots: { index: false } };
  return eigenPaginaMetadata(slug, taal, await vindEigenPagina(slug, taal, concept === "1"));
}

export default async function EigenPaginaVertaald({ params, searchParams }: Props) {
  const { slug, taal } = await params;
  const { concept } = await searchParams;
  if (!isTaal(taal)) notFound();
  const g = await vindEigenPagina(slug, taal, concept === "1");
  if (!g) notFound();
  return <EigenPaginaWeergave slug={slug} taal={taal} g={g} />;
}
