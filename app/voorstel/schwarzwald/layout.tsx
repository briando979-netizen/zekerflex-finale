import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { BASE, CONTACT, DOELGROEPEN } from "@/lib/voorstel/schwarzwald";
import { SchwarzwaldHeader, Wordmark } from "@/components/voorstel/SchwarzwaldHeader";

// Ontwerpvoorstel: een nieuwe website voor Het Schwarzwald, gebouwd op
// ZekerFlex in plaats van WordPress. Eigen omlijsting, los van de
// ZekerFlex-marketinglayout. Bewust niet in Google en nergens gelinkt: het is
// een voorbeeld voor één klant, geen officiële site van Het Schwarzwald.
export const metadata: Metadata = {
  title: { default: "Het Schwarzwald · ontwerpvoorstel", template: "%s · Het Schwarzwald (ontwerpvoorstel)" },
  description: "Ontwerpvoorstel van ZekerFlex voor een nieuwe website van Het Schwarzwald in Rijssen.",
  robots: { index: false, follow: false },
};

export default function SchwarzwaldLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-schw-cream font-sans text-schw-night">
      <a href="#inhoud" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-schw-sun focus:px-4 focus:py-2 focus:font-bold">
        Naar de inhoud
      </a>
      <div className="bg-schw-sun px-4 py-2 text-center text-xs font-semibold text-schw-night sm:text-sm">
        Ontwerpvoorstel van ZekerFlex. Dit is niet de officiële website van Het Schwarzwald.{" "}
        <a href="https://www.hetschwarzwald.nl/" className="underline underline-offset-2" rel="noopener noreferrer">
          Naar de huidige site
        </a>
      </div>
      <SchwarzwaldHeader />
      <main id="inhoud">{children}</main>
      <footer className="bg-schw-night text-schw-cream">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Wordmark light />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-schw-cream/70">
              Activiteiten, themafeesten en heerlijk eten op één bosrijke plek tussen Rijssen, Holten en Markelo. Direct aan de A1, gratis parkeren.
            </p>
            <address className="mt-6 space-y-1 text-sm not-italic text-schw-cream/80">
              <p>{CONTACT.adres}, {CONTACT.postcode}</p>
              <p>
                <a href={CONTACT.telefoonHref} className="hover:text-schw-sun">{CONTACT.telefoon}</a>
                {" · "}
                <a href={`mailto:${CONTACT.email}`} className="hover:text-schw-sun">{CONTACT.email}</a>
              </p>
            </address>
          </div>
          <nav aria-label="Voor wie">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Voor wie</p>
            <ul className="mt-4 space-y-2 text-sm">
              {DOELGROEPEN.map((d) => (
                <li key={d.slug}>
                  <Link href={`${BASE}/voor/${d.slug}`} className="text-schw-cream/80 hover:text-schw-cream">{d.naam}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Ontdek">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Ontdek</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href={`${BASE}/activiteiten`} className="text-schw-cream/80 hover:text-schw-cream">Alle activiteiten</Link></li>
              <li><Link href={`${BASE}/themafeesten`} className="text-schw-cream/80 hover:text-schw-cream">Themafeesten</Link></li>
              <li><Link href={`${BASE}/reserveren`} className="text-schw-cream/80 hover:text-schw-cream">Reserveren</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-[1280px] px-4 py-5 text-xs text-schw-cream/50 sm:px-8">
            Ontwerp en techniek: ZekerFlex. Foto&apos;s en prijzen van hetschwarzwald.nl, alleen voor dit voorstel.
          </p>
        </div>
      </footer>
    </div>
  );
}
