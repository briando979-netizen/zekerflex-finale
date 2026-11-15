import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CtaBand } from "@/components/marketing/primitives";
import { AanbodUitgebreid } from "@/components/marketing/aanbod/AanbodUitgebreid";
import { uitgebreidVan } from "@/lib/marketing/aanbod-uitgebreid";
import { AANBOD, aanbodHref, aanbodVan, eigenPaginas, pijlerVan } from "@/lib/marketing/aanbod";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { seoBeschrijving, seoTitel } from "@/lib/seo-tekst";
import { EfactuurPagina } from "@/components/marketing/aanbod/EfactuurPagina";
import { AanbodStandaard } from "@/components/marketing/aanbod/AanbodStandaard";
import { standaardVragen } from "@/lib/marketing/aanbod-vragen";
import { EFACTUUR_FAQ } from "@/lib/marketing/efactuur-pagina";

export const dynamicParams = false;

export function generateStaticParams() {
  // ook items met een eigen pagina elders (die sturen door), zodat een oude link of het menu nooit op een 404 uitkomt
  return [...eigenPaginas(), ...AANBOD.filter((a) => a.pagina)].map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = aanbodVan((await params).slug);
  if (!a) return {};
  return {
    title: { absolute: seoTitel(a.naam) },
    description: seoBeschrijving(a.tekst),
    keywords: [a.naam, ...(a.zoekwoorden ?? []), "ZekerFlex"],
    ...canonical(`/aanbod/${a.slug}`, { title: a.naam, description: a.kort }),
  };
}

// Eén product uit het aanbod (lib/marketing/aanbod.ts) dat elders nog geen
// eigen openbare pagina heeft.
export default async function AanbodItemPagina({ params }: { params: Promise<{ slug: string }> }) {
  const a = aanbodVan((await params).slug);
  if (!a) notFound();
  if (a.pagina) permanentRedirect(a.pagina);
  const pijler = pijlerVan(a.pijler);
  const uitgebreid = uitgebreidVan(a.slug);
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

  // E-facturatie heeft een eigen, uitgebreide pagina (components/marketing/aanbod/EfactuurPagina.tsx), met de vragen ook voor Google
  const eigenOntwerp = a.slug === "e-facturatie";
  const faq = eigenOntwerp ? EFACTUUR_FAQ : uitgebreid ? [] : standaardVragen(a);
  const vragen = faq.length
    ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((v) => ({ "@type": "Question", name: v.vraag, acceptedAnswer: { "@type": "Answer", text: v.antwoord } })) }]
    : [];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson([dienst, breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"], [a.naam, `/aanbod/${a.slug}`]]), ...vragen]) }}
      />

      {uitgebreid ? (
        <AanbodUitgebreid a={a} pijler={pijler} u={uitgebreid} />
      ) : (
        <>
      {eigenOntwerp ? (
        <EfactuurPagina a={a} pijlerNaam={pijler.naam} pijlerSleutel={pijler.sleutel} />
      ) : (
        <AanbodStandaard a={a} pijler={pijler} />
      )}

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
      )}
    </>
  );
}
