import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { huidigeLeerling, isEigenaar } from "@/lib/rijschool/accounts";
import { websiteVan, whatsappNummer } from "@/lib/rijschool/website";
import { prisma } from "@/lib/prisma";
import { winkelLink } from "@/lib/play/api";
import { Stuur } from "@/components/rijschool/site/Stuur";
import { SiteMenu } from "@/components/rijschool/site/SiteMenu";
import { adresRegels, telefoonLink, telefoonWeergave } from "@/lib/rijschool/format";
import { assistentAan } from "@/lib/rijschool/assistent-server";
import { VraagAssistent } from "@/components/rijschool/site/VraagAssistent";

// De publieke website van een rijschool, in de ZekerFlex-huisstijl (zoals
// schwarzwald.zekerflex.com): crème vlakken, een sticky kop met menu en een
// ronde knop in het accent, en een volle donkere voettekst met de wettelijk
// verplichte gegevens (adres, KVK). De kleuren komen van de rijschool zelf
// (lib/rijschool/kleuren.ts, altijd leesbaar). Alleen zichtbaar als de website
// online staat; de eigenaar ziet hem eerder, met een duidelijke melding.

const MENU = [
  { href: "#pakketten", label: "Pakketten" },
  { href: "#werkwijze", label: "Zo werkt het" },
  { href: "#instructeurs", label: "Instructeurs" },
  { href: "#vragen", label: "Vragen" },
];

export default async function RijschoolSiteLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const eigenaar = await isEigenaar(r);
  if (!r.online && !eigenaar) notFound();
  const leerling = await huidigeLeerling(r).catch(() => null);
  // de eigen Android-app, zodra die openbaar in de Play Store staat (lib/rijschool/app)
  const playApp = await prisma.rijschoolApp.findUnique({ where: { rijschoolId: r.id }, select: { pakketnaam: true, liveSinds: true } }).catch(() => null);
  // de AI-assistent ("Stel een vraag"), alleen als de rijschool hem aanzette
  const assistent = await assistentAan(r.id).catch(() => false);
  const w = websiteVan(r.website, r);
  const wa = whatsappNummer(w.whatsapp);
  const basis = `/rijschool/${r.slug}`;
  const tel = r.telefoon.replace(/[^0-9+]/g, "");

  return (
    <div className="min-h-screen bg-schw-cream text-schw-night">
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
      <header className="sticky top-0 z-30 border-b border-schw-night/10 bg-schw-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3 sm:px-8">
          <Link href={basis} className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl" style={{ background: "var(--rs-kleur-knop)", color: "var(--rs-op-kleur)" }}>
              <Stuur className="h-7 w-7" />
            </span>
            <span className="truncate font-display text-lg font-bold tracking-tight">{r.naam}</span>
          </Link>
          <nav aria-label="Hoofdmenu" className="ml-auto flex items-center gap-1 text-sm font-semibold">
            {MENU.map((m, i) => (
              <Link key={m.href} href={`${basis}${m.href}`} className={`${i < 2 ? "hidden md:block" : "hidden lg:block"} rounded-full px-3 py-2 hover:bg-schw-night/5`}>
                {m.label}
              </Link>
            ))}
            <Link href={`${basis}/inloggen`} className="rounded-full px-3 py-2 hover:bg-schw-night/5">
              {leerling ? "Mijn lessen" : "Inloggen"}
            </Link>
            <SiteMenu links={MENU.map((m) => ({ href: `${basis}${m.href}`, label: m.label }))} />
            {r.proeflesOnline && (
              <Link
                href={`${basis}/proefles`}
                className="whitespace-nowrap rounded-full px-4 py-2.5 font-bold shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--rs-accent-knop)", color: "var(--rs-op-accent)" }}
              >
                Proefles<span className="hidden sm:inline"> plannen</span>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="inhoud">{children}</main>
      <footer className="mt-20 text-schw-cream" style={{ background: "var(--rs-nacht)" }}>
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-14 text-sm sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-2.5 font-display text-xl font-bold">
              <Stuur className="h-8 w-8" />
              {r.naam}
            </p>
            <address className="mt-3 not-italic text-schw-cream/80">
              {adresRegels(r.adres, r.plaats).map((regel) => (
                <span key={regel} className="block">
                  {regel}
                </span>
              ))}
            </address>
            {r.kvk && <p className="mt-2 text-schw-cream/80">KVK {r.kvk}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--rs-accent-op-nacht)" }}>
              Contact
            </p>
            <ul className="mt-3 space-y-1.5 text-schw-cream/85">
              {tel && (
                <li>
                  <a href={`tel:${telefoonLink(r.telefoon)}`} className="hover:underline">
                    {telefoonWeergave(r.telefoon)}
                  </a>
                </li>
              )}
              {r.email && (
                <li>
                  <a href={`mailto:${r.email}`} className="break-all hover:underline">
                    {r.email}
                  </a>
                </li>
              )}
              {wa && (
                <li>
                  <a href={`https://wa.me/${wa}`} className="hover:underline" rel="noopener">
                    WhatsApp
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--rs-accent-op-nacht)" }}>
              Menu
            </p>
            <ul className="mt-3 space-y-1.5 text-schw-cream/85">
              {MENU.map((m) => (
                <li key={m.href}>
                  <Link href={`${basis}${m.href}`} className="hover:underline">
                    {m.label}
                  </Link>
                </li>
              ))}
              {r.proeflesOnline && (
                <li>
                  <Link href={`${basis}/proefles`} className="hover:underline">
                    Proefles plannen
                  </Link>
                </li>
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--rs-accent-op-nacht)" }}>
              Leerlingen
            </p>
            <ul className="mt-3 space-y-1.5 text-schw-cream/85">
              <li>
                <Link href={`${basis}/inloggen`} className="hover:underline">
                  Inloggen in de app
                </Link>
              </li>
              <li>
                <Link href={`${basis}/privacy`} className="hover:underline">
                  Privacy
                </Link>
              </li>
            </ul>
            {playApp?.liveSinds && (
              <a
                href={winkelLink(playApp.pakketnaam)}
                rel="noopener"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-schw-cream px-4 py-2 text-xs font-bold text-schw-night"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="currentColor">
                  <path d="M6 4l14 8-14 8z" />
                </svg>
                Download in Google Play
              </a>
            )}
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-[1280px] px-4 py-5 text-xs text-schw-cream/70 sm:px-8">
            © {r.naam} · Website en app via{" "}
            <a href="https://zekerflex.com" className="underline-offset-2 hover:underline">
              ZekerFlex
            </a>
          </p>
        </div>
      </footer>
      {assistent && <VraagAssistent slug={r.slug} naam={r.naam} />}
    </div>
  );
}
