import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/marketing/primitives";
import { AANBOD, aanbodHref, aanbodVan, eigenPaginas, pijlerVan, prijsTekst } from "@/lib/marketing/aanbod";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

export const dynamicParams = false;

export function generateStaticParams() {
  return eigenPaginas().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = aanbodVan((await params).slug);
  if (!a) return {};
  return {
    title: { absolute: `${a.naam} | ZekerFlex` },
    description: a.tekst,
    keywords: [a.naam, ...(a.zoekwoorden ?? []), "ZekerFlex"],
    ...canonical(`/aanbod/${a.slug}`, { title: a.naam, description: a.kort }),
  };
}

// Eén product uit het aanbod (lib/marketing/aanbod.ts) dat elders nog geen
// eigen openbare pagina heeft.
export default async function AanbodItemPagina({ params }: { params: Promise<{ slug: string }> }) {
  const a = aanbodVan((await params).slug);
  if (!a) notFound();
  const pijler = pijlerVan(a.pijler);
  const verwant = AANBOD.filter((x) => x.pijler === a.pijler && x.slug !== a.slug);
  const dienst = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: a.naam,
    description: a.tekst,
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
    areaServed: { "@type": "Country", name: "Nederland" },
    url: `${SITE.url}/aanbod/${a.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson([dienst, breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"], [a.naam, `/aanbod/${a.slug}`]])]) }}
      />

      <div className="hero-ink text-white">
        <div className={`shell py-20 md:py-24 ${a.foto ? "grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]" : ""}`}>
          <div>
            <p className="eyebrow text-brand-mint">
              <Link href="/aanbod" className="hover:underline">
                Aanbod
              </Link>{" "}
              ·{" "}
              <Link href={`/aanbod#${pijler.sleutel}`} className="hover:underline">
                {pijler.naam}
              </Link>
            </p>
            <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold md:text-6xl">{a.naam}</h1>
            <p className="mt-6 max-w-2xl text-lg text-white/70">{a.kort}</p>
            {a.status === "binnenkort" && (
              <p className="mt-6 inline-block rounded-full bg-plan-soft px-3 py-1 text-sm font-semibold text-plan-ink">Binnenkort beschikbaar</p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={a.start.href} className="btn-mint">
                {a.start.label}
              </Link>
              {a.start.href !== "/demo" && (
                <Link href="/demo" className="btn-ghost-invert">
                  Vraag een demo aan
                </Link>
              )}
            </div>
          </div>
          {a.foto && (
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl2 shadow-2xl ring-1 ring-white/10">
              {/* Foto's uit public/aanbod (bron en licentie in CREDITS.md), via next/image als WebP op maat. */}
              <Image src={`/aanbod/${a.foto.bestand}`} alt={a.foto.alt} fill sizes="(max-width: 1024px) 100vw, 520px" className="object-cover" priority />
            </div>
          )}
        </div>
      </div>

      <section className="bg-paper">
        <div className="shell py-16 md:py-20">
          <div className="grid gap-12 md:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              <h2 className="font-display text-3xl font-bold text-ink">Wat het is</h2>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">{a.tekst}</p>
              <h3 className="mt-10 font-display text-xl font-bold text-ink">Wat je krijgt</h3>
              <ul className="mt-4 grid gap-2 text-neutralx-700 sm:grid-cols-2">
                {a.punten.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-brand-500" aria-hidden>
                      ✓
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <aside className="h-fit rounded-2xl border border-hair bg-white p-6">
              <h2 className="font-display text-lg font-bold text-ink">In het kort</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-neutralx-500">Voor wie</dt>
                  <dd className="font-medium text-ink">{a.voorWie}</dd>
                </div>
                <div>
                  <dt className="text-neutralx-500">Prijs</dt>
                  <dd className="font-medium text-ink">{prijsTekst(a)}</dd>
                </div>
                <div>
                  <dt className="text-neutralx-500">Werkt samen met</dt>
                  <dd className="font-medium text-ink">Je ZekerFlex-account: één login voor alles</dd>
                </div>
              </dl>
              <Link href={a.start.href} className="btn-primary mt-6 block w-full text-center text-sm">
                {a.start.label}
              </Link>
            </aside>
          </div>
        </div>
      </section>

      {verwant.length > 0 && (
        <section className="bg-paper-soft" aria-labelledby="verwant-titel">
          <div className="shell py-16 md:py-20">
            <h2 id="verwant-titel" className="font-display text-2xl font-bold text-ink">
              Meer in {pijler.naam.toLowerCase()}
            </h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {verwant.map((x) => (
                <li key={x.slug}>
                  <Link href={aanbodHref(x)} className="block h-full rounded-2xl border border-hair bg-white p-5 hover:border-brand-500">
                    <span className="block font-display text-lg font-bold text-ink">{x.naam}</span>
                    <span className="mt-1 block text-sm text-neutralx-600">{x.kort}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <CtaBand
        title="Bekijk wat ZekerFlex nog meer doet"
        body="Personeel, je website en klanten, branchesoftware en administratie: alles onder één dak."
        primaryHref="/aanbod"
        primaryLabel="Het hele aanbod"
        secondaryHref="/demo"
        secondaryLabel="Vraag een demo aan"
      />
    </>
  );
}
