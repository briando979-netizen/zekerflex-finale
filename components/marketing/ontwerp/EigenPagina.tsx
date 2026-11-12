import type { Metadata } from "next";
import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { Blokken, type MediaInfo } from "@/components/marketing/ontwerp/Blokken";
import { mediaLijst } from "@/lib/ontwerp/media";
import { paginaOpSlug } from "@/lib/ontwerp/paginas-store";
import { TALEN, type Pagina, type PaginaInhoud, type Taal } from "@/lib/ontwerp/paginas";
import { canonical } from "@/lib/seo";

// ---------------------------------------------------------------------------
// Een eigen pagina uit de Site-ontwerper, in het Nederlands (/p/<slug>) of in
// een vertaling (/p/<slug>/<taal>). Bezoekers zien de live versie; een
// platformbeheerder ziet met ?concept=1 het concept (altijd buiten Google).
// ---------------------------------------------------------------------------

export interface Gevonden {
  pagina: Pagina;
  inhoud: PaginaInhoud;
  isConcept: boolean;
  /** de talen die er in deze modus zijn (naast Nederlands) */
  talen: Taal[];
}

export async function vindEigenPagina(slug: string, taal: Taal | null, concept: boolean): Promise<Gevonden | null> {
  const pagina = await paginaOpSlug(slug).catch(() => null);
  if (!pagina) return null;
  let isConcept = false;
  if (concept) {
    const principal = await getPrincipal().catch(() => null);
    isConcept = Boolean(principal && hasRole(principal, "PLATFORM_ADMIN"));
  }
  const vertalingen = (isConcept ? pagina.vertalingen : pagina.liveVertalingen) ?? {};
  const basis = isConcept ? pagina.concept : pagina.live;
  if (!basis) return null;
  const inhoud = taal ? vertalingen[taal] : basis;
  if (!inhoud) return null;
  return { pagina, inhoud, isConcept, talen: (Object.keys(vertalingen) as Taal[]).filter((t) => Object.hasOwn(TALEN, t)) };
}

const pad = (slug: string, taal: Taal | null) => (taal ? `/p/${slug}/${taal}` : `/p/${slug}`);

export function eigenPaginaMetadata(slug: string, taal: Taal | null, g: Gevonden | null): Metadata {
  if (!g) return { title: "Pagina niet gevonden", robots: { index: false } };
  const { inhoud, isConcept, talen } = g;
  const c = canonical(pad(slug, taal));
  return {
    title: inhoud.titel,
    ...(inhoud.omschrijving ? { description: inhoud.omschrijving } : {}),
    ...c,
    // hreflang: elke taalversie wijst naar alle andere, Nederlands is de standaard
    alternates: {
      ...c.alternates,
      ...(talen.length ? { languages: { nl: pad(slug, null), ...Object.fromEntries(talen.map((t) => [t, pad(slug, t)])), "x-default": pad(slug, null) } } : {}),
    },
    ...(inhoud.noindex || isConcept ? { robots: { index: false, follow: !isConcept } } : {}),
  };
}

export async function EigenPaginaWeergave({ slug, taal, g }: { slug: string; taal: Taal | null; g: Gevonden }) {
  const { inhoud, isConcept, talen } = g;
  const media: Record<string, MediaInfo> = Object.fromEntries((await mediaLijst().catch(() => [])).map((m) => [m.id, { alt: m.alt, soort: m.soort }]));
  const metHero = inhoud.blokken[0]?.soort === "hero";
  const extra = isConcept ? "?concept=1" : "";
  return (
    <div lang={taal ?? "nl"}>
      {isConcept ? (
        <p className="sticky top-0 z-40 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900" lang="nl">
          Concept{taal ? ` (${TALEN[taal].naam})` : ""}: alleen jij ziet dit. Publiceer in de Site-ontwerper om het live te zetten.
        </p>
      ) : null}
      {talen.length ? (
        <nav aria-label="Taal van deze pagina" className="border-b border-hair bg-paper-soft">
          <ul className="shell flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
            {[null, ...talen].map((t) => {
              const actief = t === taal;
              return (
                <li key={t ?? "nl"}>
                  <Link
                    href={`${pad(slug, t)}${extra}`}
                    hrefLang={t ?? "nl"}
                    lang={t ?? "nl"}
                    aria-current={actief ? "page" : undefined}
                    className={actief ? "font-semibold text-ink" : "text-neutralx-600 hover:text-ink hover:underline"}
                  >
                    {t ? TALEN[t].eigen : "Nederlands"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      {metHero ? null : <h1 className="sr-only">{inhoud.titel}</h1>}
      {inhoud.blokken.length ? <Blokken blokken={inhoud.blokken} media={media} /> : <div className="shell py-24 text-center text-neutralx-600">Deze pagina heeft nog geen blokken.</div>}
    </div>
  );
}
