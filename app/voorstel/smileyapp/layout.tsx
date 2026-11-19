import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import "./smiley.css";
import { BASE, CONTACT, KLANTLOGIN, MENU, MENU_FOOTER, OFFICIELE_SITE, PRIVACY, SLOGAN, VOORSTEL_BAND, VOORWAARDEN, beeld } from "@/lib/voorstel/smileyapp";
import { heeftTeam } from "@/lib/voorstel/smileyapp-accounts";
import { VOORSTEL_HEADER } from "@/lib/voorstel/subdomein";
import { AlleenOpSite } from "@/components/voorstel/AlleenOpSite";
import { KortAdres } from "@/components/voorstel/KortAdres";
import { SmileyMenu } from "@/components/voorstel/smileyapp/SmileyMenu";
import { SmileyChat } from "@/components/voorstel/smileyapp/SmileyChat";
import { SmileyTeller } from "@/components/voorstel/smileyapp/SmileyTeller";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

// Ontwerpvoorstel: een nieuwe website én app (PWA) voor SmileyApp, gebouwd op
// ZekerFlex (smileyapp.zekerflex.com). Eigen omlijsting, los van de
// ZekerFlex-marketinglayout. Tot Martijn akkoord geeft: niet in zoekmachines
// (noindex hier en X-Robots-Tag in middleware/next.config), op elke pagina de
// voorstelband, geen bedrijfsgegevens voor zoekmachines (JSON-LD), het formulier
// op de contactpagina dicht en niets van derden behalve hun eigen Vimeo-filmpje
// na een klik. Het beheer (/beheer, 19 nov 2026) heeft een eigen opmaak: daar
// valt de omlijsting van de site (band, kop, footer en chat) weg via AlleenOpSite.
const OMSCHRIJVING = "Ontwerpvoorstel van ZekerFlex voor een nieuwe website en app van Smileyapp: klanttevredenheid meten met een smiley die je swipet.";

export const metadata: Metadata = {
  title: { default: "Smileyapp · ontwerpvoorstel", template: "%s · Smileyapp (ontwerpvoorstel)" },
  description: OMSCHRIJVING,
  applicationName: "Smileyapp",
  keywords: null,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  manifest: `${BASE}/manifest.webmanifest`,
  icons: { icon: beeld("icoon.svg"), shortcut: beeld("icoon.svg"), apple: beeld("apple-touch-icon.png") },
  appleWebApp: { capable: true, title: "Smileyapp", statusBarStyle: "default" },
  openGraph: { title: "Smileyapp · ontwerpvoorstel", description: OMSCHRIJVING, siteName: "Smileyapp", type: "website", locale: "nl_NL", images: [{ url: beeld("logo.webp") }] },
  twitter: { card: "summary", title: "Smileyapp · ontwerpvoorstel", description: OMSCHRIJVING },
};

export const viewport: Viewport = { themeColor: "#0E2A20", colorScheme: "light" };

const FOOTERKOP = "text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun";
const FOOTERLINK = "text-white/80 hover:text-white";

export default async function SmileyappLayout({ children }: { children: ReactNode }) {
  // op het eigen subdomein (Caddy zet de kop) korte adressen in de adresbalk
  const subdomein = (await headers()).get(VOORSTEL_HEADER) !== null;
  const [voorBand, naBand = ""] = VOORSTEL_BAND.split("smileyapp.nl");
  // kan iemand van SmileyApp in het beheer inloggen? Dan leest er een team mee in de chat
  const team = await heeftTeam();
  return (
    <div className="min-h-screen overflow-x-clip bg-smiley-cream font-sans text-smiley-ink">
      <a href="#inhoud" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-full focus:bg-smiley-sun focus:px-4 focus:py-2 focus:font-bold">
        Naar de inhoud
      </a>
      {subdomein && <KortAdres basis={BASE} />}
      {/* telt paginaweergaven voor "Cijfers" in het beheer: zonder cookie, en niet in het beheer zelf */}
      <SmileyTeller />
      {/* de omlijsting van de site; in het beheer valt hij weg (de band blijft hier in de layout staan) */}
      <AlleenOpSite basis={BASE}>
      <div aria-hidden="true" className="sm-voortgang fixed inset-x-0 top-0 z-[70] h-1 bg-gradient-to-r from-smiley-green via-smiley-sun to-smiley-green" />
      <p className="bg-smiley-sun px-4 py-2 text-center text-xs font-semibold text-smiley-ink sm:text-sm">
        {voorBand}
        <a href={OFFICIELE_SITE} className="underline underline-offset-2">
          smileyapp.nl
        </a>
        {naBand}
      </p>
      <header className="sticky top-0 z-50 border-b border-smiley-ink/10 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:h-20 sm:px-8">
          <Link href={BASE} className="sm-wiebel shrink-0" aria-label="Smileyapp, naar de voorpagina">
            <Image src={beeld("logo.webp")} alt="" width={500} height={260} priority className="h-11 w-auto sm:h-14" />
          </Link>
          <nav aria-label="Hoofdmenu" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {MENU.map((m) => (
                // een link met breed: true past pas vanaf xl in de kop (op 1024 px is hij vol); hij staat ook in het uitklapmenu en de footer
                <li key={m.href} className={m.breed ? "hidden xl:block" : undefined}>
                  <Link href={m.href} className="rounded-full px-3.5 py-2 text-sm font-semibold text-smiley-ink transition-colors hover:bg-smiley-mint">
                    {m.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            <a href={KLANTLOGIN} className="hidden rounded-full px-4 py-2.5 text-sm font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint sm:inline-flex">
              Klantlogin
            </a>
            {/* op de telefoon kort ("Demo"), zodat logo, knop en menu ook op 320 px naast elkaar passen; Contact staat in het menu */}
            <Link href={`${BASE}/demo`} aria-label="Vraag een demo aan" className="inline-flex rounded-full bg-smiley-ink px-4 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 sm:px-5">
              <span className="sm:hidden">Demo</span>
              <span className="hidden sm:inline xl:hidden">Demo aanvragen</span>
              <span className="hidden xl:inline">Vraag een demo aan</span>
            </Link>
            <SmileyMenu />
          </div>
        </div>
      </header>
      </AlleenOpSite>

      <main id="inhoud">{children}</main>

      <AlleenOpSite basis={BASE}>
      <footer className="relative overflow-hidden bg-smiley-ink text-white">
        <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 opacity-10" />
        <div className="relative mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Image src={beeld("logo.webp")} alt={`Smileyapp, ${SLOGAN.toLowerCase()}`} width={500} height={260} className="h-20 w-auto" />
            <address className="mt-6 space-y-1.5 text-sm not-italic text-white/80">
              <p>
                <a href={`mailto:${CONTACT.email}`} className="font-semibold text-white hover:text-smiley-sun">
                  {CONTACT.email}
                </a>
              </p>
              <p>KvK-nummer: {CONTACT.kvk}</p>
              <p>Postadres: {CONTACT.postadres}</p>
              <p>Kantooradres: {CONTACT.kantooradres}</p>
            </address>
            <p className="mt-4 text-sm text-white/70">
              Smileyapp is onderdeel van{" "}
              <a href={CONTACT.onderdeelVanUrl} className="underline underline-offset-2 hover:text-white" rel="noopener noreferrer">
                {CONTACT.onderdeelVan}
              </a>
              .
            </p>
          </div>
          <nav aria-label="Smileyapp">
            <p className={FOOTERKOP}>Smileyapp</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[...MENU, ...MENU_FOOTER].map((m) => (
                <li key={m.href}>
                  <Link href={m.href} className={FOOTERLINK}>
                    {m.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Meer">
            <p className={FOOTERKOP}>Meer</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href={`${BASE}/demo`} className={FOOTERLINK}>
                  Vraag een demo aan
                </Link>
              </li>
              <li>
                <a href={KLANTLOGIN} className={FOOTERLINK}>
                  Klantlogin
                </a>
              </li>
              <li>
                <a href={PRIVACY} className={FOOTERLINK}>
                  Privacyverklaring
                </a>
              </li>
              <li>
                <a href={VOORWAARDEN} className={FOOTERLINK}>
                  Disclaimer &amp; Algemene voorwaarden
                </a>
              </li>
              <li>
                <a href={OFFICIELE_SITE} className={FOOTERLINK}>
                  De officiële website: smileyapp.nl
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="relative border-t border-white/10">
          <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-2 px-4 py-5 text-xs text-white/60 sm:px-8">
            <p>© Smileyapp · KvK {CONTACT.kvk}</p>
            <p>Ontwerp en techniek: ZekerFlex. Teksten, beelden, logo en video van smileyapp.nl, alleen voor dit voorstel.</p>
          </div>
        </div>
      </footer>
      <SmileyChat team={team} />
      </AlleenOpSite>
    </div>
  );
}
