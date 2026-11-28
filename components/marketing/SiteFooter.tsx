import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { NewsletterSignup } from "@/components/marketing/NewsletterSignup";
import { SocialLinks } from "@/components/marketing/SocialLinks";
import { CookieSettingsButton } from "@/components/marketing/CookieSettingsButton";
import { STANDAARD_VOETTEKST, voettekstZonderDubbel, type Voettekst } from "@/lib/ontwerp/menu";
import { topSteden } from "@/lib/seo-cities";

/** Zoveel steden in de rij "Werk per stad" (zoals eerst op de voorpagina); het overzicht heeft ze allemaal. */
const STEDEN_IN_VOETTEKST = 10;
import { BEDRIJF } from "@/lib/marketing/bedrijfsgegevens";
import { SITE } from "@/lib/seo";
import { isNietFlexwerkPad } from "@/lib/marketing/flexwerk-only";
import { WIN_PADEN, WIN_TALEN, WIN_TEKST } from "@/lib/marketing/werken-in-nederland";

// De kolommen en de zin onder het logo zijn te bewerken in Admin → Site-ontwerper → Menu
// (lib/ontwerp/menu.ts); zonder eigen versie is het de standaard daar.
// alleenFlexwerk: vlag `publiek-alleen-flexwerk` (de layout leest hem per request) — aan = de niet-flexwerk-links (shop,
// website maken, rijschool-/horecasoftware, producten, verkopen, developers, …) vallen uit de voettekst.
export function SiteFooter({ voettekst = STANDAARD_VOETTEKST, alleenFlexwerk = false }: { voettekst?: Voettekst; alleenFlexwerk?: boolean }) {
  const year = new Date().getFullYear();
  const zichtbaar = alleenFlexwerk
    ? voettekst.kolommen
        .map((col) => ({ ...col, links: col.links.filter((l) => !isNietFlexwerkPad(l.href)) }))
        .filter((col) => col.links.length > 0)
    : voettekst.kolommen;
  // elke link één keer; de telefoon en het mailadres staan al in de regel met de bedrijfsgegevens (22 nov 2026)
  const kolommen = voettekstZonderDubbel(zichtbaar, [SITE.phoneHref, `mailto:${SITE.email}`]);
  return (
    <footer className="hero-ink text-white">
      <div className="border-b border-white/10">
        <div className="shell flex flex-col gap-6 py-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-sm">
            <h2 className="font-display text-lg font-bold">Blijf op de hoogte</h2>
            <p className="mt-1.5 text-sm text-white/60">
              Af en toe een update over flexibel werk, de Wet DBA en het platform. Geen spam.
            </p>
          </div>
          <div className="w-full max-w-md">
            <NewsletterSignup source="footer" />
          </div>
        </div>
      </div>

      <h2 className="sr-only">Snel naar</h2>
      <div className={`shell grid gap-10 py-12 md:gap-12 md:py-16 ${kolommen.length === 3 ? "md:grid-cols-[1.4fr_repeat(3,1fr)]" : kolommen.length === 4 ? "md:grid-cols-[1.4fr_repeat(4,1fr)]" : kolommen.length === 2 ? "md:grid-cols-[1.4fr_repeat(2,1fr)]" : "md:grid-cols-[1.4fr_1fr]"}`}>
        <div>
          <div className="flex items-center gap-2.5">
            <LogoGlyph size={30} tone="light" />
            <span className="font-display text-lg font-bold">ZekerFlex</span>
          </div>
          {voettekst.slogan ? <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">{voettekst.slogan}</p> : null}
          {/* geen losse link naar de systeemstatus meer: /status staat één keer, in de kolom Platform (22 nov 2026) */}
          <SocialLinks className="mt-6" />
        </div>

        {kolommen.map((col, i) => (
          <div key={`${col.titel}-${i}`}>
            {col.titel ? (
              <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-white/60">
                {col.titel}
              </h3>
            ) : null}
            {/* telefoon: links in twee kolommen, anders werd Platform alleen al twee schermen lang */}
            <ul className="mt-4 columns-2 gap-x-6 md:columns-1 md:space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href + l.label} className="mb-2.5 break-inside-avoid md:mb-0">
                  <Link
                    href={l.href}
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Werk per stad: stond als tien knoppen op de voorpagina en staat sinds 22 nov 2026 hier (gebruikersonderzoek, KAN WEG);
          zo houden de stadspagina's hun links (lib/seo-cities.ts) */}
      <nav aria-label="Werk per stad" className="border-t border-white/10">
        <div className="shell flex flex-wrap items-baseline gap-x-4 gap-y-2 py-5 text-sm">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-white/60">Werk per stad</span>
          {topSteden(STEDEN_IN_VOETTEKST).map((c) => (
            <Link key={c.slug} href={`/freelance-werk/${c.slug}`} className="text-white/70 transition-colors hover:text-white">
              {c.name}
            </Link>
          ))}
          <Link href="/freelance-werk" className="font-semibold text-white/85 transition-colors hover:text-white">
            Alle steden →
          </Link>
        </div>
      </nav>

      {/* Werken in Nederland in vijf talen (28 nov 2026, lib/marketing/werken-in-nederland.ts): zo vinden zoekmachines de
          versies in het Engels, Pools, Roemeens en Oekraïens. Een gewone <a>, zodat <html lang> bij de taal van de pagina hoort. */}
      <nav aria-label="Werken in Nederland in andere talen" className="border-t border-white/10">
        <div className="shell flex flex-wrap items-baseline gap-x-4 gap-y-2 py-5 text-sm">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-white/60">Werken in Nederland</span>
          {WIN_TALEN.map((t) => (
            <a key={t} href={WIN_PADEN[t]} hrefLang={t} lang={t} className="text-white/70 transition-colors hover:text-white">
              {WIN_TEKST[t].taalNaam}
            </a>
          ))}
        </div>
      </nav>

      {/* officiële bedrijfsgegevens: iedereen kan zelf in het register van Delaware nakijken dat het bedrijf bestaat (lib/marketing/bedrijfsgegevens.ts) */}
      <div className="border-t border-white/10">
        <div className="shell py-5 text-xs leading-relaxed text-white/60">
          <p>
            <span className="font-semibold text-white/85">{BEDRIJF.naam}</span>, {BEDRIJF.rechtsvorm} · dossiernummer {BEDRIJF.dossiernummer} bij de Delaware Division of Corporations · officieel adres in Delaware: {BEDRIJF.registeredAgent}, {BEDRIJF.registeredAgentAdres}
          </p>
          <p className="mt-1">
            Telefoon{" "}
            <a href={SITE.phoneHref} className="underline underline-offset-2 hover:text-white">
              {SITE.phone}
            </a>{" "}
            (de AI-assistent neemt dag en nacht op) · e-mail{" "}
            <a href={`mailto:${SITE.email}`} className="underline underline-offset-2 hover:text-white">
              {SITE.email}
            </a>
          </p>
          <p className="mt-1">
            Zelf controleren? Zoek op dossiernummer {BEDRIJF.dossiernummer} in het{" "}
            <a href={BEDRIJF.registerUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white">
              openbare bedrijfsregister van Delaware
            </a>
            .
          </p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="shell flex flex-col items-start justify-between gap-3 py-6 text-xs text-white/65 sm:flex-row sm:items-center">
          <p>© {year} Zekerflex, Inc.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/voorwaarden" className="hover:text-white">
              Gebruiksvoorwaarden
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy policy
            </Link>
            <Link href="/cookiebeleid" className="hover:text-white">
              Cookiebeleid
            </Link>
            <CookieSettingsButton className="hover:text-white" />
            <Link href="/toegankelijkheid" className="hover:text-white">
              Toegankelijkheid
            </Link>
            <Link href="/dsa" className="hover:text-white">
              Digital Services Act
            </Link>
            <Link href="/verwerkersovereenkomst" className="hover:text-white">
              Verwerkersovereenkomst
            </Link>
            <Link href="/beveiliging" className="hover:text-white">
              Beveiliging
            </Link>
            <Link href="/copyright" className="hover:text-white">
              Copyright
            </Link>
            <Link href="/account-verwijderen" className="hover:text-white">
              Account verwijderen
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
