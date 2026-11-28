import { vt } from "@/lib/i18n/site";
import { getSiteT } from "@/lib/i18n/server";
import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import { SECTORS } from "@/lib/seo-sectors";
import { topSteden } from "@/lib/seo-cities";

interface Branch {
  key: string;
  label: string;
  photo: string;
  blurb: string;
  /** de branche in lib/seo-sectors.ts met een eigen pagina (werkers: /<branche>-vacatures, bedrijven: /<branche>-personeel-inhuren) */
  sector?: string;
}

// Ingang per branche. Geen verzonnen waarderingen of richtprijzen: alleen het
// echte minimum-uurtarief dat een opdrachtgever mag instellen (env.MIN_SHIFT_RATE_CENTS).
const BRANCHES: Branch[] = [
  { key: "logistiek", label: vt("Logistiek"), photo: "/shifts/campagne-logistiek.jpg", blurb: "Orderpicken, magazijn, inpakken en sorteren.", sector: "logistiek" },
  { key: "retail", label: vt("Retail"), photo: "/shifts/campagne-retail.jpg", blurb: "Vakkenvullen, kassa en verkoop op de winkelvloer.", sector: "retail" },
  { key: "horeca", label: vt("Horeca"), photo: "/shifts/campagne-horeca.jpg", blurb: "Bediening, bar, keuken en catering.", sector: "horeca" },
  { key: "evenement", label: vt("Evenement"), photo: "/shifts/campagne-evenement.jpg", blurb: "Festivals, beurzen, hosting en crew.", sector: "evenementen" },
  { key: "schoonmaak", label: vt("Schoonmaak"), photo: "/shifts/campagne-schoonmaak.jpg", blurb: "Housekeeping, glasbewassing en oplevering.", sector: "schoonmaak" },
  { key: "zorg", label: vt("Zorg"), photo: "/shifts/campagne-zorg.jpg", blurb: "Ondersteuning, begeleiding en welzijn." },
  { key: "kantoor", label: vt("Kantoor"), photo: "/shifts/campagne-kantoor.jpg", blurb: "Receptie, administratie en klantenservice." },
  { key: "bouw", label: vt("Bouw & techniek"), photo: "/shifts/campagne-bouw.jpg", blurb: "Montage, installatie, grond- en sloopwerk." },
];

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

/** Waar een kaart heen gaat (22 nov 2026): de branchepagina als die er is, anders de algemene ingang. */
function kaartHref(b: Branch, voor: Voor): string {
  const s = SECTORS.find((x) => x.key === b.sector);
  if (!s) return TEKST[voor].kaartHref;
  return voor === "werkers" ? `/${s.workerSlug}` : `/${s.slug}`;
}

async function Card({ b, minRateCents, t, voor }: { b: Branch; minRateCents: number; t: (typeof TEKST)[Voor]; voor: Voor }) {
  const tx = await getSiteT();
  return (
    <Link
      href={kaartHref(b, voor)}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-hair bg-paper shadow-e1 transition-all duration-300 hover:-translate-y-1 hover:shadow-e3"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={b.photo}
          alt={tx(b.label)}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
        <span className="absolute bottom-3 left-3 font-display text-lg font-bold uppercase tracking-wide text-white drop-shadow">
          {tx(b.label)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="flex-1 text-sm text-neutralx-500">{b.blurb}</p>
        <div className="mt-3 border-t border-hair pt-3">
          <p>
            <span className="text-xs text-neutralx-400">{t.vanaf} </span>
            <span className="num font-display text-lg font-bold text-ink">{euro(minRateCents)}</span>
            <span className="text-xs font-medium text-neutralx-400"> {tx("/uur")}</span>
          </p>
          <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
            {t.kaartKnop}
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

// Twee versies (14 nov): voor werkers op de homepagina (/), voor bedrijven op /bedrijven (alleen voor bedrijven).
// 22 nov 2026: werkers naar /freelance-werk (met de nieuwste klussen) in plaats van /klussen, dat met de vlag
// publiek-alleen-flexwerk op noindex staat; en onder de knop de links per stad (lib/seo-cities.ts: TOP_STEDEN).
type Voor = "werkers" | "bedrijven";
const TEKST = {
  werkers: {
    titel: vt("Werk in de branche die bij je past"),
    lead: vt("Van magazijn tot bediening. Elke klus met foto, reistijd en een helder uurtarief — zodat je precies weet waar je aan toe bent voordat je reageert."),
    vanaf: "minimaal",
    kaartHref: "/freelance-werk",
    kaartKnop: "Bekijk klussen",
    knopHref: "/freelance-werk",
    knop: vt("Bekijk alle klussen"),
    noot: "Gratis aanmelden — je zit nergens aan vast.",
    stedenKop: "Werk per stad",
    stadHref: (slug: string) => `/freelance-werk/${slug}`,
  },
  bedrijven: {
    titel: vt("Personeel in jouw branche"),
    lead: vt("Van magazijn tot bediening: zet je klus uit met datum, plek en uurtarief, en zie meteen wat hij kost."),
    vanaf: "uurtarief vanaf",
    kaartHref: "/klus-plaatsen",
    kaartKnop: "Klus plaatsen",
    knopHref: "/klus-plaatsen",
    knop: vt("Klus plaatsen"),
    noot: "Samenstellen zonder account — je betaalt alleen voor gewerkte uren.",
    stedenKop: "Personeel per stad",
    stadHref: (slug: string) => `/personeel-inhuren/${slug}`,
  },
} as const;

/** Zoveel steden onder de branches: een korte rij, het overzicht heeft ze allemaal. */
const STEDEN_IN_RIJ = 10;

/**
 * steden: de rij links per stad onder de branches. Op de voorpagina staat die sinds 22 nov 2026 niet meer (gebruikersonderzoek:
 * tien knoppen die afleiden); de voettekst heeft de rij "Werk per stad". /bedrijven houdt hem (de standaard).
 */
export async function BranchShowcase({ minRateCents, voor = "werkers", steden = true }: { minRateCents: number; voor?: Voor; steden?: boolean }) {
  const tx = await getSiteT();
  const t = TEKST[voor];
  return (
    <section className="relative bg-paper-soft">
      <div className="shell-4k py-8 md:py-10 lg:py-12">
        <Reveal>
          <p className="eyebrow">{tx("Branches")}</p>
          <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold">{tx(t.titel)}</h2>
          <p className="fluid-lead mt-5 max-w-2xl text-neutralx-600">{tx(t.lead)}</p>
        </Reveal>

        {/* Telefoon: één rij om door te vegen (acht kaarten onder elkaar waren vier
            schermen scrollen). Vanaf sm het gewone raster. Op de telefoon geen
            schuif-animatie of vertraging per kaart: die liep mis in de veegrij. */}
        <div className="-mx-5 mt-10 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-3 pt-1 [scrollbar-width:none] sm:mx-0 sm:mt-14 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:p-0 lg:grid-cols-3 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
          {BRANCHES.map((b, i) => (
            <Reveal
              key={b.key}
              delay={i * 70}
              className="w-[78%] flex-none snap-start sm:w-auto max-sm:![transform:none] max-sm:![transition-delay:0ms]"
            >
              <Card b={b} minRateCents={minRateCents} t={t} voor={voor} />
            </Reveal>
          ))}
        </div>

        <p className="mt-2 text-xs text-neutralx-500 sm:hidden" aria-hidden>
          {tx("{n} branches · veeg voor meer →", { n: BRANCHES.length })}
        </p>
        <Reveal delay={120}>
          <div className="mt-8 flex flex-wrap items-center gap-4 sm:mt-12">
            <Link href={t.knopHref} className="btn-primary">
              {tx(t.knop)}
            </Link>
            <span className="text-sm text-neutralx-500">{t.noot}</span>
          </div>
        </Reveal>
        {steden && (
          <nav aria-label={t.stedenKop} className="mt-6">
            <p className="text-sm font-semibold text-ink">{t.stedenKop}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {topSteden(STEDEN_IN_RIJ).map((c) => (
                <li key={c.slug}>
                  <Link href={t.stadHref(c.slug)} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
                    {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={voor === "werkers" ? "/freelance-werk" : "/personeel-inhuren"} className="inline-block px-1 py-1 text-sm font-semibold text-brand-600 hover:underline">
                  {tx("Alle steden →")}
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </section>
  );
}
