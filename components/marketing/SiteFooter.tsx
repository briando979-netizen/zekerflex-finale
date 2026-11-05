import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { NewsletterSignup } from "@/components/marketing/NewsletterSignup";
import { SocialLinks } from "@/components/marketing/SocialLinks";
import { CookieSettingsButton } from "@/components/marketing/CookieSettingsButton";
import { STANDAARD_VOETTEKST, type Voettekst } from "@/lib/ontwerp/menu";

// De kolommen en de zin onder het logo zijn te bewerken in Admin → Site-ontwerper → Menu
// (lib/ontwerp/menu.ts); zonder eigen versie is het de standaard daar.
export function SiteFooter({ voettekst = STANDAARD_VOETTEKST }: { voettekst?: Voettekst }) {
  const year = new Date().getFullYear();
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
      <div className={`shell grid gap-10 py-12 md:gap-12 md:py-16 ${voettekst.kolommen.length === 3 ? "md:grid-cols-[1.4fr_repeat(3,1fr)]" : voettekst.kolommen.length === 4 ? "md:grid-cols-[1.4fr_repeat(4,1fr)]" : voettekst.kolommen.length === 2 ? "md:grid-cols-[1.4fr_repeat(2,1fr)]" : "md:grid-cols-[1.4fr_1fr]"}`}>
        <div>
          <div className="flex items-center gap-2.5">
            <LogoGlyph size={30} tone="light" />
            <span className="font-display text-lg font-bold">ZekerFlex</span>
          </div>
          {voettekst.slogan ? <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">{voettekst.slogan}</p> : null}
          <div className="mt-5 flex items-center gap-2 text-xs text-white/50">
            <Link href="/status" className="underline hover:text-white">
              Bekijk de systeemstatus
            </Link>
          </div>
          <SocialLinks className="mt-6" />
        </div>

        {voettekst.kolommen.map((col, i) => (
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

      <div className="border-t border-white/10">
        <div className="shell flex flex-col items-start justify-between gap-3 py-6 text-xs text-white/65 sm:flex-row sm:items-center">
          <p>© {year} ZekerFlex B.V. · Amsterdam</p>
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
