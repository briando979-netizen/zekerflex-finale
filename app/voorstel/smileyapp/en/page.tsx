import type { Metadata } from "next";
import { beeld } from "@/lib/voorstel/smileyapp";
import { smileyappPakketten } from "@/lib/voorstel/smileyapp-pakketten";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { HeroKop, KOP_KLASSE, LandingHero, LandingTaal } from "@/components/voorstel/smileyapp/taal/Landing";

// De voorpagina van het SmileyApp-voorstel in het Engels (/en), in verkorte
// vorm. De opbouw staat in components/voorstel/smileyapp/taal/Landing.tsx, de
// teksten in lib/voorstel/smileyapp-talen.ts. Hier: de taal op de omlijsting
// (<html lang> blijft "nl"), de ene kop (h1) en de pakketten zoals de site ze nu
// toont, zodat de prijzen het beheer volgen. Net als de rest van het voorstel
// buiten zoekmachines (noindex), dus ook zonder verwijzingen naar taalversies.
export const dynamic = "force-dynamic";

const TAAL = "en";
const t = TEKSTEN[TAAL];

// absolute: anders plakt de layout er "· Smileyapp (ontwerpvoorstel)" achter
export const metadata: Metadata = {
  title: { absolute: t.meta.titel },
  description: t.meta.omschrijving,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  openGraph: { title: t.meta.titel, description: t.meta.omschrijving, siteName: "Smileyapp", type: "website", locale: "en_GB", images: [{ url: beeld("logo.webp") }] },
  twitter: { card: "summary", title: t.meta.titel, description: t.meta.omschrijving },
};

export default async function SmileyappEnglish() {
  const pakketten = await smileyappPakketten();
  return (
    <div lang="en">
      <LandingHero taal={TAAL}>
        <h1 className={KOP_KLASSE}>
          <HeroKop taal={TAAL} />
        </h1>
      </LandingHero>
      <LandingTaal taal={TAAL} pakketten={pakketten} />
    </div>
  );
}
