import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { huidigeLeerling, isEigenaar } from "@/lib/rijschool/accounts";
import { websiteVan, whatsappNummer } from "@/lib/rijschool/website";

// De publieke website van een rijschool: kop met menu, voettekst met de
// wettelijk verplichte gegevens (adres, KVK). Alleen zichtbaar als de website
// online staat; de eigenaar ziet hem eerder, met een duidelijke melding.

export default async function RijschoolSiteLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const eigenaar = await isEigenaar(r);
  if (!r.online && !eigenaar) notFound();
  const leerling = await huidigeLeerling(r).catch(() => null);
  const w = websiteVan(r.website, r);
  const wa = whatsappNummer(w.whatsapp);
  const basis = `/rijschool/${r.slug}`;

  return (
    <>
      <a href="#inhoud" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:font-semibold">
        Naar de inhoud
      </a>
      {!r.online && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          Voorbeeld: alleen jij ziet deze website. Zet hem online via{" "}
          <Link href="/werkgever/rijschool" className="underline underline-offset-2">
            je beheer
          </Link>
          .
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-hair bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href={basis} className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-base font-bold text-white" style={{ background: "var(--rs-kleur)" }} aria-hidden>
              {r.naam.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate font-display text-lg font-bold">{r.naam}</span>
          </Link>
          <nav aria-label="Hoofdmenu" className="ml-auto flex items-center gap-1 text-sm font-semibold">
            <Link href={`${basis}#pakketten`} className="hidden rounded-full px-3 py-2 hover:bg-paper-soft sm:block">
              Pakketten
            </Link>
            <Link href={`${basis}#instructeurs`} className="hidden rounded-full px-3 py-2 hover:bg-paper-soft md:block">
              Instructeurs
            </Link>
            <Link href={`${basis}/inloggen`} className="rounded-full px-3 py-2 hover:bg-paper-soft">
              {leerling ? "Mijn lessen" : "Inloggen"}
            </Link>
            {r.proeflesOnline && (
              <Link href={`${basis}/proefles`} className="whitespace-nowrap rounded-full px-4 py-2 text-white" style={{ background: "var(--rs-kleur)" }}>
                Proefles<span className="hidden sm:inline"> plannen</span>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="inhoud">{children}</main>
      <footer className="mt-16 border-t border-hair bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-neutralx-600 sm:grid-cols-3">
          <div>
            <p className="font-display text-base font-bold text-ink">{r.naam}</p>
            {r.adres && <p className="mt-1">{r.adres}</p>}
            {r.plaats && <p>{r.plaats}</p>}
            {r.kvk && <p className="mt-1">KVK {r.kvk}</p>}
          </div>
          <div>
            <p className="font-semibold text-ink">Contact</p>
            {r.telefoon && (
              <p className="mt-1">
                <a href={`tel:${r.telefoon.replace(/[^0-9+]/g, "")}`} className="hover:underline">
                  {r.telefoon}
                </a>
              </p>
            )}
            {r.email && (
              <p>
                <a href={`mailto:${r.email}`} className="hover:underline">
                  {r.email}
                </a>
              </p>
            )}
            {wa && (
              <p>
                <a href={`https://wa.me/${wa}`} className="hover:underline" rel="noopener">
                  WhatsApp
                </a>
              </p>
            )}
          </div>
          <div>
            <p className="font-semibold text-ink">Leerlingen</p>
            <p className="mt-1">
              <Link href={`${basis}/inloggen`} className="hover:underline">
                Inloggen in de app
              </Link>
            </p>
            <p className="mt-3 text-xs text-neutralx-500">
              Website en app via{" "}
              <a href="https://zekerflex.com" className="hover:underline">
                ZekerFlex
              </a>
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
