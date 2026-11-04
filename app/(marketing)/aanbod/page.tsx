import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/marketing/primitives";
import { AANBOD, aanbodHref, PIJLERS, prijsTekst, WERK_ZOEKEN } from "@/lib/marketing/aanbod";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const TITLE = "Het aanbod van ZekerFlex: personeel, website, branchesoftware en administratie";
const DESCRIPTION =
  "Alles voor je bedrijf onder één dak: flexwerkers en uitzendkrachten, een eigen website en meer Google-reviews, software voor horeca en rijscholen, en facturen en rekentools. Met één account voor alles.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ZekerFlex` },
  description: DESCRIPTION,
  keywords: ["zekerflex aanbod", "software voor ondernemers", "horeca software", "rijschool software", "website laten maken", "personeel inhuren"],
  ...canonical("/aanbod", { title: TITLE, description: DESCRIPTION }),
};

// Overzicht van al het aanbod, per pijler. Alles komt uit lib/marketing/aanbod.ts.
export default function AanbodPagina() {
  const lijst = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Aanbod van ZekerFlex",
    itemListElement: AANBOD.map((a, i) => ({ "@type": "ListItem", position: i + 1, name: a.naam, url: `${SITE.url}${aanbodHref(a)}` })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson([lijst, breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"]])]) }} />

      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Aanbod</p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold md:text-6xl">Alles voor je bedrijf onder één dak</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">
            Personeel, je website en klanten, software voor jouw branche en je administratie. Je zet aan wat je nodig hebt, met één
            account voor alles.
          </p>
          <nav aria-label="Pijlers" className="mt-8 flex flex-wrap gap-2">
            {PIJLERS.map((p) => (
              <a key={p.sleutel} href={`#${p.sleutel}`} className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10">
                {p.naam}
              </a>
            ))}
            <a href="#werk-zoeken" className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10">
              Ik zoek werk
            </a>
          </nav>
        </div>
      </div>

      {PIJLERS.map((p, i) => {
        const items = AANBOD.filter((a) => a.pijler === p.sleutel);
        return (
          <section key={p.sleutel} id={p.sleutel} aria-labelledby={`${p.sleutel}-titel`} className={`scroll-mt-24 ${i % 2 ? "bg-paper-soft" : "bg-paper"}`}>
            <div className="shell py-16 md:py-20">
              <div className="max-w-2xl">
                <h2 id={`${p.sleutel}-titel`} className="font-display text-3xl font-bold text-ink md:text-4xl">
                  {p.naam}
                </h2>
                <p className="mt-3 text-lg leading-relaxed text-neutralx-600">{p.intro}</p>
              </div>
              <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((a) => (
                  <li key={a.slug} className="flex min-w-0 flex-col rounded-2xl border border-hair bg-white p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 font-display text-xl font-bold text-ink">
                        <Link href={aanbodHref(a)} className="hover:underline">
                          {a.naam}
                        </Link>
                      </h3>
                      {a.status === "binnenkort" && (
                        <span className="flex-shrink-0 rounded-full bg-plan-soft px-2.5 py-1 text-xs font-semibold text-plan-ink">Binnenkort</span>
                      )}
                    </div>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{a.kort}</p>
                    <p className="mt-4 text-sm">
                      <span className="text-neutralx-500">Prijs: </span>
                      <span className="font-semibold text-ink">{prijsTekst(a)}</span>
                    </p>
                    <Link href={aanbodHref(a)} className="mt-4 text-sm font-semibold text-brand-600 hover:underline">
                      Meer over {a.naam.toLowerCase()} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}

      <section id="werk-zoeken" aria-labelledby="werk-zoeken-titel" className="scroll-mt-24 bg-[#0C0E12] text-white">
        <div className="shell py-16 md:py-20">
          <div className="max-w-2xl">
            <h2 id="werk-zoeken-titel" className="font-display text-3xl font-bold md:text-4xl">
              Ik zoek werk
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-white/70">
              Als flexwerker, uitzendkracht of zzp&apos;er vind je diensten bij jou in de buurt. Meedoen is gratis.
            </p>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WERK_ZOEKEN.map((w) => (
              <li key={w.href}>
                <Link href={w.href} className="block h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 hover:bg-white/[0.08]">
                  <span className="block font-display text-lg font-bold">{w.naam}</span>
                  <span className="mt-1 block text-sm text-white/70">{w.kort}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand
        title="Begin met één onderdeel, zet later meer aan"
        body="Maak gratis een account aan. Wil je eerst zien hoe het werkt? Vraag een demo aan."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Gratis account aanmaken"
        secondaryHref="/demo"
        secondaryLabel="Vraag een demo aan"
      />
    </>
  );
}
