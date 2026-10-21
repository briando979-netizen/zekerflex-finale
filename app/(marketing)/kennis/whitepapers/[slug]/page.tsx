import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WHITEPAPERS, whitepaperBySlug } from "@/lib/kennis/whitepapers";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";

export function generateStaticParams() {
  return WHITEPAPERS.map((w) => ({ slug: w.slug }));
}

// Search-result titles/descriptions per whitepaper, written for what people
// actually search (Search Console: "inkomstenbelasting freelancer", "belasting
// freelance", …). The on-page title stays as is.
const SEO: Record<string, { title: string; description: string }> = {
  "werken-via-zekerflex": {
    title: "Freelancen via ZekerFlex: zo werkt het",
    description: "Alles wat je moet weten als freelancer: klussen vinden, uren schrijven, factureren en uitbetaling. Gratis gids.",
  },
  omzetbelasting: {
    title: "Btw voor freelancers: zo doe je aangifte",
    description: "Btw (omzetbelasting) als freelancer: wanneer je btw rekent, hoe je aangifte doet en wat je terugkrijgt. Gratis gids met voorbeelden.",
  },
  inkomstenbelasting: {
    title: "Inkomstenbelasting als freelancer: uitleg & tips",
    description: "Belasting als freelancer: hoe je inkomstenbelasting over je winst aangeeft, welke aftrekposten je hebt en hoe je reserveert. Gratis gids.",
  },
  kleineondernemersregeling: {
    title: "KOR voor freelancers: wanneer is het slim?",
    description: "De kleineondernemersregeling (KOR) uitgelegd voor freelancers: voorwaarden, voordelen, nadelen en wanneer je je aanmeldt.",
  },
  aftrekposten: {
    title: "Aftrekposten voor freelancers: wat mag je aftrekken?",
    description: "Welke kosten mag je als freelancer aftrekken en hoe vraag je btw terug? Overzicht van aftrekposten met voorbeelden.",
  },
  administratie: {
    title: "Administratie als freelancer: zo houd je het op orde",
    description: "Je administratie als freelancer op orde: facturen, bonnetjes, bewaarplicht en handige gewoontes. Gratis gids.",
  },
  verzekering: {
    title: "Verzekeringen voor freelancers: wat heb je nodig?",
    description: "Welke verzekeringen heb je als freelancer nodig? Aansprakelijkheid, arbeidsongeschiktheid en meer, helder uitgelegd.",
  },
};

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const w = whitepaperBySlug(params.slug);
  if (!w) return { title: "Whitepaper" };
  const seo = SEO[w.slug];
  return {
    title: seo?.title ?? `${w.title} — whitepaper`,
    description: seo?.description ?? w.intro,
    ...canonical(`/kennis/whitepapers/${w.slug}`),
  };
}

function nlDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export default async function WhitepaperReaderPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const wp = whitepaperBySlug(params.slug);
  if (!wp) notFound();

  const wpLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: wp.title,
    description: wp.intro,
    dateModified: wp.updated,
    inLanguage: "nl-NL",
    articleSection: wp.category,
    author: { "@type": "Organization", name: SITE.name },
    publisher: { "@id": `${SITE.url}/#organization` },
    mainEntityOfPage: `${SITE.url}/kennis/whitepapers/${wp.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            wpLd,
            breadcrumbJsonLd([
              ["Whitepapers", "/kennis/whitepapers"],
              [wp.title, `/kennis/whitepapers/${wp.slug}`],
            ]),
          ]),
        }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <Link href="/kennis/whitepapers" className="text-sm font-medium text-white/60 hover:text-white">
            ← Whitepapers
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">{wp.category}</p>
          <h1 className="mt-3 max-w-3xl text-balance font-display text-3xl font-bold leading-tight md:text-[2.7rem]">
            {wp.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">{wp.subtitle}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href={`/api/kennis/whitepaper/${wp.slug}`} className="btn-mint">
              Download als PDF
            </a>
            <span className="font-mono text-xs uppercase tracking-wide text-white/60">
              {wp.readMinutes} min lezen · bijgewerkt {nlDate(wp.updated)}
            </span>
          </div>
        </div>
      </div>

      <article className="bg-paper">
        <div className="shell max-w-3xl py-16 md:py-20">
          <p className="text-[1.05rem] font-medium leading-relaxed text-ink">{wp.intro}</p>

          {wp.sections.map((s, si) => (
            <section key={si} className="mt-12 first:mt-10">
              <h2 className="font-display text-xl font-bold text-ink md:text-2xl">{s.heading}</h2>
              {s.blocks.map((b, bi) => {
                if (b.t === "p")
                  return (
                    <p key={bi} className="mt-4 text-[1.02rem] leading-relaxed text-neutralx-700">
                      {b.text}
                    </p>
                  );
                if (b.t === "h3")
                  return (
                    <h3 key={bi} className="mt-6 font-display text-lg font-semibold text-ink">
                      {b.text}
                    </h3>
                  );
                if (b.t === "note")
                  return (
                    <p
                      key={bi}
                      className="mt-5 rounded-xl border-l-4 border-brand-mint bg-mintwash px-4 py-3 text-[0.97rem] leading-relaxed text-brand-700"
                    >
                      <strong className="font-semibold">Let op:</strong> {b.text}
                    </p>
                  );
                return (
                  <ul key={bi} className="mt-4 space-y-2">
                    {b.items.map((it, ii) => (
                      <li key={ii} className="flex gap-3 text-[1.02rem] leading-relaxed text-neutralx-700">
                        <span className="mt-1 text-brand-mint">→</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                );
              })}
            </section>
          ))}

          <div className="mt-14 flex flex-wrap gap-3 border-t border-hair pt-8">
            <a href={`/api/kennis/whitepaper/${wp.slug}`} className="btn-primary">
              Download als PDF
            </a>
            <Link href="/kennis/whitepapers" className="btn-ghost">
              Alle whitepapers
            </Link>
          </div>

          <p className="mt-8 text-sm text-neutralx-500">
            Algemene informatie, geen fiscaal of juridisch advies. Bedragen en regels kunnen wijzigen — raadpleeg
            bij twijfel de Belastingdienst of een adviseur.
          </p>
        </div>
      </article>
    </>
  );
}
