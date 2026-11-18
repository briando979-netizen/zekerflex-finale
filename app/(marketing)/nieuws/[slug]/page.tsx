import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { ldJson } from "@/lib/seo/json-ld";
import { seoBeschrijving, seoSjabloonTitel } from "@/lib/seo-tekst";
import { breadcrumbJsonLd, canonical, CONTACTS, SITE } from "@/lib/seo";
import { NIEUWS_BRONNEN } from "@/lib/nieuws/bronnen";
import { nieuwsDatum } from "@/lib/nieuws/lijst";
import { leesMinuten, RUBRIEK_NAAM } from "@/lib/nieuws/regels";
import { leesBericht } from "@/lib/nieuws/store";

export const dynamic = "force-dynamic";

// Eén bericht uit de nieuwsroom. Een concept of een bericht dat van de site is gehaald ziet alleen een beheerder
// (met een balk erboven, zonder dat een zoekmachine het mag opnemen); voor ieder ander bestaat het niet.

const veiligeSlug = (s: string) => /^[a-z0-9-]{1,120}$/.test(s);

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const b = veiligeSlug(slug) ? await leesBericht(slug).catch(() => null) : null;
  if (!b || b.status !== "geplaatst") return { title: "Nieuwsroom", robots: { index: false, follow: false } };
  const c = canonical(`/nieuws/${b.slug}`);
  return {
    title: seoSjabloonTitel(b.titel),
    description: seoBeschrijving(b.samenvatting),
    ...c,
    openGraph: { ...c.openGraph, type: "article", publishedTime: b.geplaatst ?? b.gemaakt },
  };
}

export default async function NieuwsBerichtPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  if (!veiligeSlug(slug)) notFound();
  const b = await leesBericht(slug).catch(() => null);
  if (!b) notFound();
  const openbaar = b.status === "geplaatst";
  if (!openbaar) {
    const principal = await getPrincipal().catch(() => null);
    if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) notFound();
  }
  const datum = b.geplaatst ?? b.gemaakt;
  const licentie = NIEUWS_BRONNEN.find((x) => x.naam === b.bron.naam)?.licentie ?? `Bron: ${b.bron.naam}`;

  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: b.titel,
    description: b.samenvatting,
    datePublished: datum,
    inLanguage: "nl-NL",
    author: { "@type": "Organization", name: SITE.name },
    publisher: { "@id": `${SITE.url}/#organization` },
    mainEntityOfPage: `${SITE.url}/nieuws/${b.slug}`,
    isBasedOn: b.bron.url,
  };

  return (
    <>
      {openbaar ? (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: ldJson([
              ld,
              breadcrumbJsonLd([
                ["Nieuwsroom", "/nieuws"],
                [b.titel, `/nieuws/${b.slug}`],
              ]),
            ]),
          }}
        />
      ) : (
        <p role="status" className="bg-amber-100 px-4 py-3 text-center text-sm font-semibold text-ink">
          {b.status === "concept" ? "Dit is een concept: alleen jij ziet het. Plaatsen doe je in Beheer, Nieuwsroom." : "Dit bericht is van de site gehaald: alleen jij ziet het."}
        </p>
      )}
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <Link href="/nieuws" className="text-sm font-medium text-white/60 hover:text-white">
            ← Nieuwsroom
          </Link>
          <h1 className="mt-6 max-w-3xl text-balance font-display text-3xl font-bold leading-tight md:text-[2.7rem]">{b.titel}</h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">{b.samenvatting}</p>
          <p className="mt-6 font-mono text-xs uppercase tracking-wide text-white/60">
            {nieuwsDatum(datum)} · {RUBRIEK_NAAM[b.rubriek] ?? "Nieuws"} · {leesMinuten(b)} min lezen
          </p>
        </div>
      </div>

      <article className="bg-paper">
        <div className="shell max-w-3xl py-16 md:py-20">
          {b.blokken.map((blok, bi) => (
            <section key={bi} className="mt-10 first:mt-0">
              {blok.kop ? <h2 className="font-display text-xl font-bold text-ink md:text-2xl">{blok.kop}</h2> : null}
              {blok.alineas.map((p, i) => (
                <p key={i} className={`text-[1.02rem] leading-relaxed text-neutralx-700 ${blok.kop ? "mt-4" : "mt-4 first:mt-0"}`}>
                  {p}
                </p>
              ))}
            </section>
          ))}

          <aside className="mt-12 rounded-2xl border border-hair bg-paper p-5 text-sm leading-relaxed text-neutralx-600">
            <p>
              <span className="font-semibold text-ink">{licentie}.</span> Het oorspronkelijke bericht van {nieuwsDatum(b.bron.datum)}:{" "}
              <a href={b.bron.url} rel="noopener nofollow" className="font-semibold text-ink underline">
                {b.bron.titel}
              </a>
              .
            </p>
            <p className="mt-2">
              Dit bericht is door onze site samengevat met hulp van AI en is geen advies. Zie je een fout? Mail{" "}
              <a href={`mailto:${CONTACTS.pers}`} className="font-semibold text-ink underline">
                {CONTACTS.pers}
              </a>
              .
            </p>
          </aside>

          <div className="mt-10 flex flex-wrap gap-3 border-t border-hair pt-8">
            <Link href="/nieuws" className="btn-primary">
              Meer nieuws
            </Link>
            <Link href="/kennis" className="btn-ghost">
              Naar Kennis
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
