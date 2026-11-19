import type { Metadata } from "next";
import { pakket } from "@/lib/voorstel/smileyapp";
import { smileyappPakketten } from "@/lib/voorstel/smileyapp-pakketten";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { ContactTaal } from "@/components/voorstel/smileyapp/taal/Contact";
import { DEMO_KOP_KLASSE } from "@/components/voorstel/smileyapp/taal/Landing";
import { PaginaHero } from "@/components/voorstel/smileyapp/taal/Paginas";

// Contact in het Duits (/de/contact), deel 6b. Het formulier staat ook hier dicht
// zolang dit een ontwerpvoorstel is. ?pakket=<id> vanaf een prijskaart zet dat pakket
// vooraan, met de prijs zoals de site hem nu toont (de wijzigingen uit het beheer).
export const dynamic = "force-dynamic";

const TAAL = "de";
const t = TEKSTEN[TAAL];

export const metadata: Metadata = {
  title: { absolute: t.meta.contactTitel },
  description: t.meta.contactOmschrijving,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function SmileyappContactGerman({ searchParams }: { searchParams: Promise<{ pakket?: string | string[] }> }) {
  const q = (await searchParams).pakket;
  const pakketten = await smileyappPakketten();
  const gekozen = pakket(Array.isArray(q) ? q[0] : q, pakketten);
  return (
    <div lang="de">
      <PaginaHero boven={t.contact.boven} sub={t.contact.sub}>
        <h1 className={DEMO_KOP_KLASSE}>{t.contact.kop}</h1>
      </PaginaHero>
      <ContactTaal taal={TAAL} gekozen={gekozen} />
    </div>
  );
}
