import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { zaakVanSlug } from "@/lib/horeca/store";
import { isEigenaar } from "@/lib/horeca/toegang";
import { siteKleuren } from "@/lib/rijschool/kleuren";
import { DAGEN, leesTijden, tijdTekst } from "@/lib/horeca/tijden";
import { telefoonLink, telefoonWeergave } from "@/lib/rijschool/format";

// De publieke site van een horecazaak, in de ZekerFlex-huisstijl (zoals
// schwarzwald.zekerflex.com) met de kleuren van de zaak zelf (altijd leesbaar,
// lib/rijschool/kleuren.ts). Alleen zichtbaar als de site online staat; de
// eigenaar ziet hem eerder, met een duidelijke melding.

export default async function HorecaSiteLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const z = await zaakVanSlug((await params).slug).catch(() => null);
  if (!z) notFound();
  const eigenaar = await isEigenaar(z);
  if (!z.online && !eigenaar) notFound();
  const basis = `/horeca/${z.slug}`;
  const tijden = leesTijden(z.openingstijden);

  return (
    <div style={siteKleuren(z)} className="min-h-screen bg-[var(--rs-creme)] text-[#0A120E]">
      <a href="#inhoud" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:font-semibold">
        Naar de inhoud
      </a>
      {!z.online && (
        <p className="bg-[var(--rs-accent-knop)] px-4 py-2 text-center text-sm font-semibold text-[var(--rs-op-accent)]">
          Alleen jij ziet deze site: hij staat nog niet online.{" "}
          <Link href="/werkgever/horeca" className="underline underline-offset-2">
            Naar het beheer
          </Link>
        </p>
      )}
      <header className="sticky top-0 z-30 bg-[var(--rs-nacht)] text-[var(--rs-creme)]">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-8">
          {/* een lange naam wordt ingekort, de knoppen houden hun plek (390 px) */}
          <Link href={basis} className="min-w-0 truncate font-display text-xl font-bold tracking-tight">
            {z.naam}
          </Link>
          <nav aria-label="Hoofdmenu" className="flex flex-shrink-0 items-center gap-1 text-sm font-semibold sm:gap-4">
            <a href={`${basis}#menukaart`} className="rounded-full px-3 py-2 hover:bg-white/10">
              Menukaart
            </a>
            <a href={`${basis}#openingstijden`} className="hidden rounded-full px-3 py-2 hover:bg-white/10 sm:inline">
              Openingstijden
            </a>
            {z.telefoon && (
              <a href={telefoonLink(z.telefoon)} className="rounded-full bg-[var(--rs-accent-knop)] px-4 py-2 font-bold text-[var(--rs-op-accent)]">
                Bel ons
              </a>
            )}
          </nav>
        </div>
      </header>
      <main id="inhoud">{children}</main>
      <footer className="bg-[var(--rs-nacht)] text-[var(--rs-creme)]">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-12 sm:px-8 md:grid-cols-3">
          <div>
            <p className="font-display text-2xl font-bold">{z.naam}</p>
            <p className="mt-3 text-sm text-[var(--rs-creme)]/80">
              {z.adres && (
                <>
                  {z.adres}
                  <br />
                </>
              )}
              {z.plaats}
            </p>
            {z.kvk && <p className="mt-2 text-sm text-[var(--rs-creme)]/80">KVK {z.kvk}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">Contact</p>
            <ul className="mt-3 space-y-1 text-sm">
              {z.telefoon && (
                <li>
                  <a href={telefoonLink(z.telefoon)} className="hover:underline">
                    {telefoonWeergave(z.telefoon)}
                  </a>
                </li>
              )}
              {z.email && (
                <li>
                  <a href={`mailto:${z.email}`} className="hover:underline">
                    {z.email}
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">Openingstijden</p>
            <dl className="mt-3 space-y-1 text-sm">
              {DAGEN.map(({ dag, naam }) => (
                <div key={dag} className="flex justify-between gap-4">
                  <dt className="text-[var(--rs-creme)]/80">{naam}</dt>
                  <dd className="font-semibold">{tijdTekst(tijden[dag])}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className="border-t border-white/10 px-4 py-4 text-center text-xs text-[var(--rs-creme)]/70">© {z.naam} · Website via ZekerFlex</p>
      </footer>
    </div>
  );
}
