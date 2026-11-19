import type { Metadata } from "next";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { DEMO_KOP_KLASSE } from "@/components/voorstel/smileyapp/taal/Landing";
import { BranchesTaal, PaginaHero } from "@/components/voorstel/smileyapp/taal/Paginas";

// Het overzicht van de branches in het Duits (/de/branches), deel 6b. De opbouw
// staat in components/voorstel/smileyapp/taal/Paginas.tsx, de teksten in
// lib/voorstel/smileyapp-talen.ts. Hier: de taal op de omlijsting en de ene kop.
export const dynamic = "force-dynamic";

const TAAL = "de";
const t = TEKSTEN[TAAL];

export const metadata: Metadata = {
  title: { absolute: t.meta.branchesTitel },
  description: t.meta.branchesOmschrijving,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function SmileyappBranchesGerman() {
  return (
    <div lang="de">
      <PaginaHero boven={t.branchePagina.boven} sub={t.branchePagina.sub}>
        <h1 className={DEMO_KOP_KLASSE}>{t.branchePagina.kop}</h1>
      </PaginaHero>
      <BranchesTaal taal={TAAL} />
    </div>
  );
}
