import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { ProductLeadForm } from "@/components/marketing/ProductLeadForm";
import { SPINOFF_PRODUCTS, FLAGSHIP, ALL_PRODUCTS, type Product } from "@/lib/products";
import { FotoKolom } from "@/components/marketing/HeroMetFoto";
import { paginaFoto } from "@/lib/marketing/fotos";

const title = "Producten — losse modules of het complete platform";
const description =
  "Kies alleen wat je nodig hebt: RecruitFlex AI (sourcing en matching), SovereignOps, de FlexCompliance API of het complete uitzendplatform.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["ai recruitment software", "self-hosted ai stack", "stipp api", "abu fase api", "uitzendsoftware", "white-label flexplatform"],
  ...canonical("/producten", { title, description }),
};

const FAQ = [
  { q: "Moet ik het hele platform afnemen?", a: "Nee. Je kunt één losse module nemen — bijvoorbeeld alleen RecruitFlex AI naast je bestaande ATS — of de compliance-API, of de self-hosted stack. Het complete platform is er voor wie álles onder één dak wil." },
  { q: "Kan RecruitFlex AI koppelen met mijn huidige systeem?", a: "Ja. RecruitFlex AI draait als losse SaaS/plug-in en koppelt via REST-API + webhooks aan bestaande ATS'en zoals Carerix, Otys, Bullhorn of Teamtailor — je hoeft je administratie niet te vervangen." },
  { q: "Waarom SovereignOps in plaats van een Amerikaanse cloud?", a: "Voor bedrijven, zorg en ICT-dienstverleners die hun data om AVG-/EU-AI-Act-redenen niet naar OpenAI/Microsoft willen sturen. SovereignOps draait de hele AI- en app-stack op je eigen (goedkope) VPS, met één commando." },
  { q: "Wat kost de FlexCompliance API?", a: "Op basis van gebruik: een klein bedrag per verwerkte loonstrook/aangifte, met een maandelijks minimum. Ideaal voor HR-softwarebouwers en salarisbureaus die StiPP/ABU-logica niet zelf willen bouwen." },
  { q: "Zijn de prijzen definitief?", a: "Het zijn indicatieve startprijzen; de definitieve prijs stemmen we af op je omvang en gebruik. Vraag een voorstel aan via het formulier of sales@zekerflex.com." },
];

function complexityLabel(c: Product["salesComplexity"]): string {
  return c === "laag" ? "Laag" : c === "gemiddeld" ? "Gemiddeld" : "Hoog";
}

function ProductCard({ p }: { p: Product }) {
  const href = p.flagship ? "/voor-bureaus" : `/producten/${p.slug}`;
  return (
    <div className={`flex flex-col rounded-2xl border bg-white p-6 ${p.featured ? "border-brand-500 shadow-card" : "border-hair"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{p.kicker}</p>
        {p.featured && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">Snelste omzet</span>}
      </div>
      <h3 className="mt-2 font-display text-xl font-bold text-ink">{p.name}</h3>
      <p className="mt-1 text-sm text-neutralx-600">{p.tagline}</p>
      <p className="mt-4 font-display text-base font-bold text-ink">{p.priceLabel}</p>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-neutralx-700">
        {p.features.slice(0, 4).map((f, i) => (
          <li key={i} className="flex gap-2"><span className="mt-0.5 flex-shrink-0 text-brand-500" aria-hidden>✓</span><span>{f}</span></li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={href} className={`rounded-full px-5 py-2.5 text-center text-sm font-semibold ${p.featured ? "btn-primary" : "btn-ghost border border-hairstrong"}`}>
          {p.flagship ? "Bekijk het platform" : "Meer & aanvragen"}
        </Link>
      </div>
    </div>
  );
}

export default function ProductenPage() {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "ZekerFlex producten",
    itemListElement: ALL_PRODUCTS.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: { "@type": "Product", name: p.name, description: p.tagline, category: p.kicker },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(itemList) }} />

      <div className="hero-ink text-white">
        <div className="shell grid items-center gap-10 py-20 md:py-24 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
          <p className="eyebrow text-brand-mint">Producten</p>
          <h1 className="mt-4 font-display text-4xl font-bold md:text-6xl">Koop alleen wat je nodig hebt</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">
            ZekerFlex is ontbundeld in losse producten die elk één scherp probleem oplossen — AI-sourcing, een soevereine
            AI-stack of de lastige NL uitzend-compliance — naast het complete all-in-one platform.
          </p>
          </div>
          <FotoKolom foto={paginaFoto("producten")} />
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Spin-offs" title="Drie losse producten uit één motor" intro="Lagere drempel, kortere verkoopcyclus: begin klein en groei door naar het volledige platform." />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {SPINOFF_PRODUCTS.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Vlaggenschip" title="Of het complete platform" intro="Voor bureaus die de hele keten onder één dak willen — white-label of self-hosted." />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2"><ProductCard p={FLAGSHIP} /></div>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Vergelijk" title="Welk product past bij jou?" />
        {/* onder md per product onder elkaar (op een telefoon vielen twee kolommen buiten beeld); vanaf md een gewone tabel */}
        <div className="mt-8 overflow-x-auto">
          <table className="block w-full border-collapse text-left text-sm md:table md:min-w-[640px]">
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-hairstrong text-neutralx-500">
                <th className="py-3 pr-4 font-semibold">Product</th>
                <th className="py-3 pr-4 font-semibold">Doelgroep</th>
                <th className="py-3 pr-4 font-semibold">Verkoopcomplexiteit</th>
                <th className="py-3 pr-4 font-semibold">Tijd tot eerste omzet</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {ALL_PRODUCTS.map((p) => (
                <tr key={p.slug} className="block border-b border-hair py-3 align-top md:table-row md:py-0">
                  <td className="block font-semibold text-ink md:table-cell md:py-3 md:pr-4">{p.name}</td>
                  <td className="block pt-1 text-neutralx-700 md:table-cell md:py-3 md:pr-4">{p.audience}</td>
                  <td className="block pt-1 text-neutralx-700 md:table-cell md:py-3 md:pr-4">
                    <span className="text-neutralx-500 md:hidden">Verkoopcomplexiteit: </span>
                    {complexityLabel(p.salesComplexity)}
                  </td>
                  <td className="block pt-1 text-neutralx-700 md:table-cell md:py-3 md:pr-4">
                    <span className="text-neutralx-500 md:hidden">Tijd tot eerste omzet: </span>
                    {p.timeToMrr}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Interesse?" title="Vraag een product aan" intro="Kies een product of laat het open — we denken met je mee over de beste aanpak." />
        <div className="mt-8 max-w-3xl">
          <ProductLeadForm />
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Goed om te weten" />
        <div className="mt-8"><FaqList items={FAQ} /></div>
      </Section>

      <CtaBand
        title="Twijfel je welk product past?"
        body="Bekijk de losse producten of de volledige platform-opties, of vraag direct een gesprek aan."
        primaryHref="#aanvraag"
        primaryLabel="Aanvraag doen"
        secondaryHref="/voor-bureaus"
        secondaryLabel="Platform & white-label"
      />
    </>
  );
}
