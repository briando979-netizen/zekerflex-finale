import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { branche } from "@/lib/voorstel/smileyapp-branches";
import { taalBasis } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN, brancheTaal } from "@/lib/voorstel/smileyapp-talen";
import { DEMO_KOP_KLASSE } from "@/components/voorstel/smileyapp/taal/Landing";
import { BrancheTaal, PaginaHero } from "@/components/voorstel/smileyapp/taal/Paginas";

// Eén branche in het Duits (/de/branches/<slug>), deel 6b: dezelfde opbouw als de
// Nederlandse pagina, met een voorbeeldvragenlijst die ook hier een voorbeeld heet.
// Een onbekende slug bestaat niet (branche() en brancheTaal() kijken met
// Object.hasOwn in de vaste lijst).
export const dynamic = "force-dynamic";

const TAAL = "de";
const t = TEKSTEN[TAAL];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tekst = brancheTaal((await params).slug, TAAL);
  if (!tekst) return {};
  return {
    title: { absolute: t.meta.brancheTitel.replace("{kop}", () => tekst.kop) },
    description: t.meta.branchesOmschrijving,
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  };
}

export default async function SmileyappBrancheGerman({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = branche(slug);
  const tekst = brancheTaal(slug, TAAL);
  if (!b || !tekst) notFound();
  return (
    <div lang="de">
      <PaginaHero boven={tekst.naam} terug={{ label: t.branchePagina.alle, href: `${taalBasis(TAAL)}/branches` }}>
        <h1 className={DEMO_KOP_KLASSE}>{tekst.kop}</h1>
      </PaginaHero>
      <BrancheTaal taal={TAAL} branche={b} tekst={tekst} />
    </div>
  );
}
