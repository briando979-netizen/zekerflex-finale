import Image from "next/image";
import Link from "next/link";
import { BASE, CONTACT, KLANTLOGIN, MENU, MENU_FOOTER, OFFICIELE_SITE, PRIVACY, VOORWAARDEN, beeld } from "@/lib/voorstel/smileyapp";
import { KADER, taalBasis, type Vertaling } from "@/lib/voorstel/smileyapp-taal";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";
import { SmileyMenuTaal } from "@/components/voorstel/smileyapp/SmileyMenuTaal";
import { TaalKiezer } from "@/components/voorstel/smileyapp/TaalKiezer";

// De omlijsting van het SmileyApp-voorstel op /en en /de (server): de vertaalde
// regel onder de voorstelband, de kop en de footer. De layout toont ze via
// OpTaal alleen op pagina's in die taal; de Nederlandse omlijsting staat in de
// layout zelf. Elk blok draagt lang, zodat een schermlezer de juiste stem kiest
// en de browser Duitse woorden goed afbreekt. De links wijzen naar de secties
// van de vertaalde voorpagina; pagina's die alleen in het Nederlands bestaan,
// staan apart in de footer en heten daar ook zo.

const FOOTERKOP = "text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun";
const FOOTERLINK = "text-white/80 hover:text-white";

/** De links naar de secties van de vertaalde voorpagina. */
function secties(taal: Vertaling) {
  const t = KADER[taal].menu;
  const b = taalBasis(taal);
  return [
    { label: t.hoe, href: `${b}#zo-werkt-het`, kop: true },
    { label: t.probeer, href: `${b}#probeer`, kop: false },
    { label: t.pakketten, href: `${b}#pakketten`, kop: true },
    { label: t.klanten, href: `${b}#klanten`, kop: true },
    { label: t.vragen, href: `${b}#vragen`, kop: true },
  ];
}

/** De voorstelband in de taal van de pagina, onder de Nederlandse regel (die blijft altijd staan). */
export function BandTaal({ taal }: { taal: Vertaling }) {
  const [voor, na = ""] = KADER[taal].band.split("smileyapp.nl");
  return (
    <p lang={taal} className="-mt-1 px-4 pb-2 text-center text-xs font-semibold text-smiley-ink sm:text-sm lg:px-40">
      {voor}
      <a href={OFFICIELE_SITE} className="underline underline-offset-2">
        smileyapp.nl
      </a>
      {na}
    </p>
  );
}

export function KopTaal({ taal }: { taal: Vertaling }) {
  const t = KADER[taal];
  const b = taalBasis(taal);
  const links = secties(taal);
  return (
    <header lang={taal} className="sticky top-0 z-50 border-b border-smiley-ink/10 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:h-20 sm:px-8">
        <Link href={b} className="sm-wiebel shrink-0" aria-label={t.logo}>
          <Image src={beeld("logo.webp")} alt="" width={500} height={260} priority className="h-11 w-auto sm:h-14" />
        </Link>
        {/* vier links: op 1024 px passen ze met Klantlogin en de demoknop ruim naast het logo (nagerekend: ±815 van 960 px) */}
        <nav aria-label={t.hoofdmenu} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {links
              .filter((l) => l.kop)
              .map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="rounded-full px-3.5 py-2 text-sm font-semibold text-smiley-ink transition-colors hover:bg-smiley-mint">
                    {l.label}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <a href={KLANTLOGIN} className="hidden whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint sm:inline-flex">
            {t.klantlogin}
          </a>
          {/* op de telefoon kort ("Demo"), zodat logo, knop en menu ook op 320 px naast elkaar passen */}
          <Link href={`${b}/demo`} aria-label={t.demo} className="inline-flex whitespace-nowrap rounded-full bg-smiley-ink px-4 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 sm:px-5">
            <span className="sm:hidden">{t.demoKort}</span>
            <span className="hidden sm:inline">{t.demo}</span>
          </Link>
          <SmileyMenuTaal
            items={links.map(({ label, href }) => ({ label, href }))}
            demo={{ label: t.demo, href: `${b}/demo` }}
            klantlogin={{ label: t.klantlogin, href: KLANTLOGIN }}
            teksten={{ openen: t.menuOpenen, sluiten: t.menuSluiten, naam: t.menuNaam }}
          />
        </div>
      </div>
    </header>
  );
}

export function VoetTaal({ taal }: { taal: Vertaling }) {
  const t = KADER[taal];
  const f = t.footer;
  const b = taalBasis(taal);
  return (
    <footer lang={taal} className="relative overflow-hidden bg-smiley-ink text-white">
      <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 opacity-10" />
      <div className="relative mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Image src={beeld("logo.webp")} alt="Smileyapp" width={500} height={260} className="h-20 w-auto" />
          <address className="mt-6 space-y-1.5 text-sm not-italic text-white/80">
            <p>
              <a href={`mailto:${CONTACT.email}`} className="font-semibold text-white hover:text-smiley-sun">
                {CONTACT.email}
              </a>
            </p>
            <p>
              {f.kvk}: {CONTACT.kvk}
            </p>
            <p>
              {f.postadres}: {CONTACT.postadres}
            </p>
            <p>
              {f.kantooradres}: {CONTACT.kantooradres}
            </p>
          </address>
          <p className="mt-4 text-sm text-white/70">
            {f.onderdeelVan}{" "}
            <a href={CONTACT.onderdeelVanUrl} className="underline underline-offset-2 hover:text-white" rel="noopener noreferrer">
              {CONTACT.onderdeelVan}
            </a>
            .
          </p>
          {/* links in de footer, niet rechtsonder: daar zweeft de chatknop */}
          <div className="mt-6">
            <TaalKiezer variant="footer" />
          </div>
        </div>
        <nav aria-label="Smileyapp">
          <p className={FOOTERKOP}>Smileyapp</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {secties(taal).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={FOOTERLINK}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href={`${b}/demo`} className={FOOTERLINK}>
                {t.demo}
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={f.meer}>
          <p className={FOOTERKOP}>{f.meer}</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <a href={KLANTLOGIN} className={FOOTERLINK}>
                {t.klantlogin}
              </a>
            </li>
            <li>
              <a href={PRIVACY} className={FOOTERLINK}>
                {f.privacy}
              </a>
            </li>
            <li>
              <a href={VOORWAARDEN} className={FOOTERLINK}>
                {f.voorwaarden}
              </a>
            </li>
            <li>
              <a href={OFFICIELE_SITE} className={FOOTERLINK}>
                {f.officieel}
              </a>
            </li>
          </ul>
        </nav>
      </div>
      {/* de pagina's die alleen in het Nederlands bestaan, met hun Nederlandse naam */}
      <nav aria-label={f.nederlands} className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-sm sm:px-8">
          <p className="font-semibold text-white/70">{f.nederlands}:</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {[...MENU, ...MENU_FOOTER]
              .filter((m) => !m.href.startsWith(`${BASE}#`))
              .map((m) => (
                <li key={m.href}>
                  <Link href={m.href} lang="nl" hrefLang="nl" className={FOOTERLINK}>
                    {m.label}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </nav>
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-2 px-4 py-5 text-xs text-white/60 sm:px-8">
          <p>© Smileyapp · KvK {CONTACT.kvk}</p>
          <p>{f.ontwerp}</p>
        </div>
      </div>
    </footer>
  );
}
