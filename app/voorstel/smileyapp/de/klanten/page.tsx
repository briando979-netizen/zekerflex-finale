import type { Metadata } from "next";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { DEMO_KOP_KLASSE } from "@/components/voorstel/smileyapp/taal/Landing";
import { KlantenTaal, PaginaHero } from "@/components/voorstel/smileyapp/taal/Paginas";

// De klantverhalen in het Duits (/de/klanten), deel 6b. De twee echte quotes van
// smileyapp.nl blijven in het Nederlands staan (lang="nl", met de regel dat het het
// origineel is); de uitwerking eromheen is vertaald. Dynamisch: het blok met
// reviews volgt wat het team in het beheer invoert.
export const dynamic = "force-dynamic";

const TAAL = "de";
const t = TEKSTEN[TAAL];

export const metadata: Metadata = {
  title: { absolute: t.meta.klantenTitel },
  description: t.meta.klantenOmschrijving,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function SmileyappKlantenGerman() {
  return (
    <div lang="de">
      <PaginaHero boven={t.klantenPagina.boven} sub={t.klantenPagina.sub}>
        <h1 className={DEMO_KOP_KLASSE}>{t.klanten.kop}</h1>
      </PaginaHero>
      <KlantenTaal taal={TAAL} />
    </div>
  );
}
