import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { BASE, CONTACT, DOELGROEPEN, MENU, OPENINGSTIJDEN, SOCIAAL, TOPLINKS, doelgroepHref } from "@/lib/voorstel/schwarzwald";
import { pagina, paginaPaden } from "@/lib/voorstel/schwarzwald-paginas";
import { Logo, SchwarzwaldHeader, type ZoekItem } from "@/components/voorstel/SchwarzwaldHeader";

// Ontwerpvoorstel: een nieuwe website voor Het Schwarzwald, gebouwd op
// ZekerFlex in plaats van WordPress. Eigen omlijsting, los van de
// ZekerFlex-marketinglayout. Bewust niet in Google en nergens gelinkt: het is
// een voorbeeld voor één klant, geen officiële site van Het Schwarzwald.
export const metadata: Metadata = {
  title: { default: "Het Schwarzwald · ontwerpvoorstel", template: "%s · Het Schwarzwald (ontwerpvoorstel)" },
  description: "Ontwerpvoorstel van ZekerFlex voor een nieuwe website van Het Schwarzwald in Rijssen.",
  robots: { index: false, follow: false },
};

function zoekIndex(): ZoekItem[] {
  const items: ZoekItem[] = [
    ...MENU.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href, groep: g.label }))),
    ...TOPLINKS.map((t) => ({ label: t.label, href: t.href, groep: "Algemeen" })),
    { label: "Reserveren", href: `${BASE}/reserveren`, groep: "Algemeen" },
    ...paginaPaden()
      .filter((p) => p.startsWith("/vacatures/"))
      .map((p) => ({ label: pagina(p)?.titel ?? p, href: `${BASE}${p}`, groep: "Vacatures" })),
  ];
  const gezien = new Set<string>();
  return items.filter((i) => {
    const k = i.href + i.label;
    if (gezien.has(k)) return false;
    gezien.add(k);
    return true;
  });
}

const KOP = "text-xs font-bold uppercase tracking-[0.18em] text-schw-sun";
const LINK = "text-schw-cream/80 hover:text-schw-cream";

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
      <SchwarzwaldHeader zoekIndex={zoekIndex()} />
      <main id="inhoud">{children}</main>
      <footer className="bg-schw-night text-schw-cream">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <Logo className="h-20 w-auto" />
            <address className="mt-6 space-y-1 text-sm not-italic text-schw-cream/80">
              <p>{CONTACT.adres}</p>
              <p>{CONTACT.postcode}</p>
              <p className="pt-2">
                Telefoon: <a href={CONTACT.telefoonHref} className="hover:text-schw-sun">{CONTACT.telefoon}</a>
              </p>
              <p>
                E-mailadres: <a href={`mailto:${CONTACT.email}`} className="hover:text-schw-sun">{CONTACT.email}</a>
              </p>
            </address>
            <ul className="mt-6 flex gap-2">
              {SOCIAAL.map((s) => (
                <li key={s.naam}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="block rounded-full bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/20">
                    {s.naam}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className={KOP}>Openingstijden</p>
            <dl className="mt-4 space-y-3 text-sm">
              {OPENINGSTIJDEN.map((o) => (
                <div key={o.dagen}>
                  <dt className="text-schw-cream/60">{o.dagen}</dt>
                  <dd className="font-semibold">{o.tijd}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-schw-cream/60">Groepen vanaf 12 personen ook op andere dagen, op reservering.</p>
          </div>
          <nav aria-label="Voor wie">
            <p className={KOP}>Ik zoek een…</p>
            <ul className="mt-4 space-y-2 text-sm">
              {DOELGROEPEN.map((d) => (
                <li key={d.slug}>
                  <Link href={doelgroepHref(d)} className={LINK}>{d.naam}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Ontdek">
            <p className={KOP}>Ontdek</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href={`${BASE}/activiteiten`} className={LINK}>Alle activiteiten</Link></li>
              <li><Link href={`${BASE}/themafeesten`} className={LINK}>Themafeesten</Link></li>
              <li><Link href={`${BASE}/zakelijk`} className={LINK}>Zakelijk</Link></li>
              <li><Link href={`${BASE}/restaurant`} className={LINK}>Restaurant</Link></li>
              {TOPLINKS.map((t) => (
                <li key={t.href}><Link href={t.href} className={LINK}>{t.label}</Link></li>
              ))}
              <li><Link href={`${BASE}/reserveren`} className={LINK}>Reserveren</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-2 px-4 py-5 text-xs text-schw-cream/50 sm:px-8">
            <p>© Het Schwarzwald B.V. · KvK {CONTACT.kvk} · btw {CONTACT.btw}</p>
            <p>Ontwerp en techniek: ZekerFlex. Teksten, foto&apos;s en logo van hetschwarzwald.nl, alleen voor dit voorstel.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
