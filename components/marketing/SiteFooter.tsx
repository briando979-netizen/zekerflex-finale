import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { NewsletterSignup } from "@/components/marketing/NewsletterSignup";
import { SocialLinks } from "@/components/marketing/SocialLinks";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { href: "/voor-freelancers", label: "Voor freelancers" },
      { href: "/uitzendbureau", label: "Werken via uitzendbureau" },
      { href: "/voor-bedrijven", label: "Voor bedrijven" },
      { href: "/prijzen", label: "Prijzen" },
      { href: "/app", label: "Download de app" },
      { href: "/status", label: "Systeemstatus" },
    ],
  },
  {
    title: "Kennis",
    links: [
      { href: "/kennis", label: "Informatie" },
      { href: "/kennis#kennisbank", label: "Kennisbank" },
      { href: "/kennis/wet-dba", label: "Wet DBA" },
      { href: "/kennis/werkgevers", label: "Helpcentrum werkgevers" },
      { href: "/kennis/whitepapers", label: "Whitepapers" },
      { href: "/kennis/blog", label: "Blog" },
      { href: "/kennis/faq", label: "Veelgestelde vragen" },
    ],
  },
  {
    title: "Bedrijf",
    links: [
      { href: "/over-ons", label: "Over ZekerFlex" },
      { href: "/demo", label: "Vraag een demo aan" },
      { href: "/over-ons#werken-bij", label: "Werken bij ons" },
      { href: "/status", label: "Uptime & incidenten" },
      { href: "mailto:info@zekerflex.com", label: "info@zekerflex.com" },
      { href: "/login", label: "Inloggen" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="hero-ink text-white">
      <div className="border-b border-white/10">
        <div className="shell flex flex-col gap-6 py-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-sm">
            <h3 className="font-display text-lg font-bold">Blijf op de hoogte</h3>
            <p className="mt-1.5 text-sm text-white/60">
              Af en toe een update over flexibel werk, de Wet DBA en het platform. Geen spam.
            </p>
          </div>
          <div className="w-full max-w-md">
            <NewsletterSignup source="footer" />
          </div>
        </div>
      </div>

      <div className="shell grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoGlyph size={30} tone="light" />
            <span className="font-display text-lg font-bold">ZekerFlex</span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
            Zeker van je werk, zeker van je mensen. Het onafhankelijke
            Nederlandse platform voor flexibel werk — volledig lokaal gehost,
            zonder tussenpartijen.
          </p>
          <div className="mt-5 flex items-center gap-2 text-xs text-white/50">
            <span className="h-2 w-2 rounded-full bg-brand-mint animate-pulse-dot" />
            Alle systemen operationeel ·{" "}
            <Link href="/status" className="underline hover:text-white">
              status
            </Link>
          </div>
          <SocialLinks className="mt-6" />
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-white/40">
              {col.title}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
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
        <div className="shell flex flex-col items-start justify-between gap-3 py-6 text-xs text-white/45 sm:flex-row sm:items-center">
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
            <Link href="/dsa" className="hover:text-white">
              Digital Services Act
            </Link>
            <Link href="/verwerkersovereenkomst" className="hover:text-white">
              Verwerkersovereenkomst
            </Link>
            <Link href="/copyright" className="hover:text-white">
              Copyright
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
