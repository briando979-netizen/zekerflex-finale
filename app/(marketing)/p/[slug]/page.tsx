import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EigenPaginaWeergave, eigenPaginaMetadata, vindEigenPagina } from "@/components/marketing/ontwerp/EigenPagina";

// Eigen pagina's uit de Site-ontwerper (Admin → Site-ontwerper → Pagina's), in het Nederlands.
// Vertalingen staan op /p/<slug>/<taal>. Een beheerder ziet met ?concept=1 het concept.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ concept?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { concept } = await searchParams;
  return eigenPaginaMetadata(slug, null, await vindEigenPagina(slug, null, concept === "1"));
}

export default async function EigenPagina({ params, searchParams }: Props) {
  const { slug } = await params;
  const { concept } = await searchParams;
  const g = await vindEigenPagina(slug, null, concept === "1");
  if (!g) notFound();
  return <EigenPaginaWeergave slug={slug} taal={null} g={g} />;
}
