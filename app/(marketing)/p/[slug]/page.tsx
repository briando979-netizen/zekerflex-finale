import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { Blokken, type MediaInfo } from "@/components/marketing/ontwerp/Blokken";
import { mediaLijst } from "@/lib/ontwerp/media";
import { paginaOpSlug } from "@/lib/ontwerp/paginas-store";
import type { PaginaInhoud } from "@/lib/ontwerp/paginas";
import { canonical } from "@/lib/seo";

// Eigen pagina's uit de Site-ontwerper (Admin → Site-ontwerper → Pagina's).
// Bezoekers zien de live versie; een platformbeheerder ziet met ?concept=1 het
// concept (het voorbeeld in de ontwerper), altijd buiten zoekmachines.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ concept?: string }> };

async function inhoudVoor(slug: string, concept: boolean): Promise<{ inhoud: PaginaInhoud; isConcept: boolean } | null> {
  const pagina = await paginaOpSlug(slug).catch(() => null);
  if (!pagina) return null;
  if (concept) {
    const principal = await getPrincipal().catch(() => null);
    if (principal && hasRole(principal, "PLATFORM_ADMIN")) return { inhoud: pagina.concept, isConcept: true };
  }
  return pagina.live ? { inhoud: pagina.live, isConcept: false } : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { concept } = await searchParams;
  const gevonden = await inhoudVoor(slug, concept === "1");
  if (!gevonden) return { title: "Pagina niet gevonden", robots: { index: false } };
  const { inhoud, isConcept } = gevonden;
  return {
    title: inhoud.titel,
    ...(inhoud.omschrijving ? { description: inhoud.omschrijving } : {}),
    ...canonical(`/p/${slug}`),
    ...(inhoud.noindex || isConcept ? { robots: { index: false, follow: !isConcept } } : {}),
  };
}

export default async function EigenPagina({ params, searchParams }: Props) {
  const { slug } = await params;
  const { concept } = await searchParams;
  const gevonden = await inhoudVoor(slug, concept === "1");
  if (!gevonden) notFound();
  const { inhoud, isConcept } = gevonden;
  const media: Record<string, MediaInfo> = Object.fromEntries((await mediaLijst().catch(() => [])).map((m) => [m.id, { alt: m.alt, soort: m.soort }]));
  const metHero = inhoud.blokken[0]?.soort === "hero";
  return (
    <>
      {isConcept ? (
        <p className="sticky top-0 z-40 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">Concept: alleen jij ziet dit. Publiceer in de Site-ontwerper om het live te zetten.</p>
      ) : null}
      {metHero ? null : <h1 className="sr-only">{inhoud.titel}</h1>}
      {inhoud.blokken.length ? (
        <Blokken blokken={inhoud.blokken} media={media} />
      ) : (
        <div className="shell py-24 text-center text-neutralx-600">Deze pagina heeft nog geen blokken.</div>
      )}
    </>
  );
}
