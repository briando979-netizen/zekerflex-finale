import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { ProductLeadForm } from "@/components/marketing/ProductLeadForm";
import { SPINOFF_PRODUCTS, spinoffProduct, type ProductDeployment } from "@/lib/products";

export const dynamicParams = false;

export function generateStaticParams() {
  return SPINOFF_PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = spinoffProduct((await params).slug);
  if (!p) return {};
  const title = `${p.name} — ${p.kicker}`;
  return {
    title: { absolute: `${title} | ZekerFlex` },
    description: p.concept,
    keywords: [p.name, p.kicker, "ZekerFlex", p.audience],
    ...canonical(`/producten/${p.slug}`, { title, description: p.concept }),
  };
}

const deploymentLabel: Record<ProductDeployment, string> = {
  saas: "SaaS of plug-in",
  "self-hosted": "Self-hosted",
  api: "API as a service",
  platform: "Platform (white-label)",
};

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = spinoffProduct((await params).slug);
  if (!p) notFound();

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.concept,
    category: p.kicker,
    brand: { "@type": "Brand", name: "ZekerFlex" },
    url: `${SITE.url}/producten/${p.slug}`,
    offers: { "@type": "Offer", priceCurrency: "EUR", availability: "https://schema.org/InStock", description: p.priceLabel },
  };

  const facts: { label: string; value: string }[] = [
    { label: "Voor wie", value: p.audience },
    { label: "Vorm", value: deploymentLabel[p.deployment] },
    { label: "Verkoopcyclus", value: p.salesComplexity === "laag" ? "Kort" : p.salesComplexity === "gemiddeld" ? "Gemiddeld" : "Langer traject" },
    { label: "Tijd tot eerste omzet", value: p.timeToMrr },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(productLd) }} />

      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">
            <Link href="/producten" className="hover:underline">Producten</Link> · {p.kicker}
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold md:text-6xl">{p.name}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">{p.tagline}</p>
          <p className="mt-4 font-display text-lg font-semibold text-brand-mint">{p.priceLabel}</p>
          <div className="mt-8">
            <Link href="#aanvraag" className="btn-mint">{p.ctaLabel}</Link>
          </div>
        </div>
      </div>

      <Section tone="paper">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr]">
          <div>
            <SectionHead eyebrow="Het concept" title="Wat het is" intro={p.concept} />

            <h3 className="mt-10 font-display text-xl font-bold text-ink">Waarom dit werkt</h3>
            <ul className="mt-4 space-y-2 text-sm text-neutralx-700">
              {p.why.map((w, i) => (
                <li key={i} className="flex gap-2"><span className="mt-0.5 flex-shrink-0 text-brand-500" aria-hidden>✓</span><span>{w}</span></li>
              ))}
            </ul>

            <h3 className="mt-10 font-display text-xl font-bold text-ink">Wat je krijgt</h3>
            <ul className="mt-4 grid gap-2 text-sm text-neutralx-700 sm:grid-cols-2">
              {p.features.map((f, i) => (
                <li key={i} className="flex gap-2"><span className="mt-0.5 flex-shrink-0 text-brand-500" aria-hidden>✓</span><span>{f}</span></li>
              ))}
            </ul>

            <p className="mt-10 text-xs text-neutralx-400">
              Hergebruikt uit het platform: {p.reused.join(" · ")}.
            </p>
          </div>

          <aside className="rounded-2xl border border-hair bg-white p-6 h-fit">
            <h3 className="font-display text-lg font-bold text-ink">In het kort</h3>
            <dl className="mt-4 space-y-3 text-sm">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-neutralx-500">{f.label}</dt>
                  <dd className="font-medium text-ink">{f.value}</dd>
                </div>
              ))}
              <div>
                <dt className="text-neutralx-500">Prijs</dt>
                <dd className="font-medium text-ink">{p.priceLabel}</dd>
              </div>
            </dl>
            <Link href="#aanvraag" className="btn-primary mt-6 w-full text-center text-sm">{p.ctaLabel}</Link>
          </aside>
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Interesse?" title={`Vraag ${p.name} aan`} intro="Laat je gegevens achter, dan nemen we binnen één werkdag contact op met een voorstel op maat." />
        <div className="mt-8 max-w-3xl">
          <ProductLeadForm defaultProduct={p.slug} />
        </div>
      </Section>

      <CtaBand
        title="Liever eerst de andere opties zien?"
        body="Bekijk alle losse producten en het complete platform naast elkaar."
        primaryHref="/producten"
        primaryLabel="Alle producten"
        secondaryHref="/voor-bureaus"
        secondaryLabel="Platform & white-label"
      />
    </>
  );
}
