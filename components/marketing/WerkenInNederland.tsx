import Image from "next/image";
import { Section, SectionHead, FaqList } from "@/components/marketing/primitives";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { TaalStartLink } from "@/components/marketing/TaalStartLink";
import { FOTO_MAP, paginaFoto } from "@/lib/marketing/fotos";
import { WIN_PADEN, WIN_TALEN, WIN_TEKST, type WinTaal } from "@/lib/marketing/werken-in-nederland";
import { breadcrumbJsonLd } from "@/lib/seo";
import { featureEnabled } from "@/lib/flags";
import { WERK_IN_BELGIE_VLAG, WERK_IN_BUITENLAND_VLAG } from "@/lib/geo/vestiging-land";
import { ldJson } from "@/lib/seo/json-ld";

// "Werken in Nederland" in één taal (28 nov 2026): dezelfde opbouw als /starten-als-uitzendkracht (kop met foto, drie
// kenmerken, stappen, vragen, slot), met alle tekst uit lib/marketing/werken-in-nederland.ts. Kop en voettekst van de site
// blijven Nederlands; de inhoud krijgt daarom zelf een lang-attribuut. De taalkeuze bovenaan en de knoppen zijn gewone <a>'s:
// bij een volle paginalading zet de root-layout <html lang> op de taal van het adres.

export async function WerkenInNederland({ taal }: { taal: WinTaal }) {
  const t = WIN_TEKST[taal];
  // Staat werken buiten Nederland aan (vlag werk-in-buitenland: elk land; werk-in-belgie: België; 28 nov 2026), dan klopt "alle
  // diensten zijn in Nederland" niet meer: dan het eerste punt met dat land. Bij een storing uit (de stand zonder override).
  const [metBuitenland, metBelgie] = await Promise.all([
    featureEnabled(WERK_IN_BUITENLAND_VLAG).catch(() => false),
    featureEnabled(WERK_IN_BELGIE_VLAG).catch(() => false),
  ]);
  const plaats = metBuitenland ? t.plaatsMetBuitenland : metBelgie ? t.plaatsMetBelgie : null;
  const eerlijk = plaats ? [plaats, ...t.eerlijk.slice(1)] : t.eerlijk;
  // Een klus in België kan zodra een van beide vlaggen aan staat; daar is het bedrijf de werkgever (lib/belgie/, sessie fd 28 nov).
  const faq = metBuitenland || metBelgie ? t.faq.map((f, i) => (i === 3 ? { ...f, a: `${f.a} ${t.werkgeverBelgie}` } : f)) : t.faq;
  const pad = WIN_PADEN[taal];
  const basisFoto = paginaFoto("werken-in-nederland");
  const foto = basisFoto ? { ...basisFoto, alt: t.fotoAlt } : undefined;
  const vragen = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: taal,
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <div lang={taal}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson([breadcrumbJsonLd([["ZekerFlex", "/"], [t.kruimel, pad]]), vragen]) }}
      />
      <Section>
        <nav aria-label={t.andereTalen} className="mb-8 flex flex-wrap gap-2">
          {WIN_TALEN.map((x) =>
            x === taal ? (
              <span key={x} lang={x} aria-current="page" className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                {WIN_TEKST[x].taalNaam}
              </span>
            ) : (
              <a
                key={x}
                href={WIN_PADEN[x]}
                hrefLang={x}
                lang={x}
                className="rounded-full border border-hairstrong px-3 py-1.5 text-xs font-semibold text-neutralx-600 transition-colors hover:text-ink"
              >
                {WIN_TEKST[x].taalNaam}
              </a>
            ),
          )}
        </nav>
        <HeroMetFoto foto={foto}>
          <SectionHead kop="h1" eyebrow={t.eyebrow} title={t.kop} intro={t.intro} />
          <div className="mt-10 flex flex-wrap gap-3">
            <TaalStartLink taal={taal} href="/register?type=freelancer" className="btn-primary">
              {t.knopStart}
            </TaalStartLink>
            <TaalStartLink taal={taal} href="/app" className="btn-ghost">
              {t.knopApp}
            </TaalStartLink>
          </div>
        </HeroMetFoto>
      </Section>

      <Section tone="soft">
        <div className="grid gap-5 sm:grid-cols-3">
          {t.kenmerken.map((k) => (
            <div key={k.kop} className="rounded-2xl border border-hair bg-white p-6 text-center">
              <p className="font-display text-4xl font-bold text-brand-600">{k.kop}</p>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{k.tekst}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHead title={t.stappenKop} />
        <ol className="mt-10 grid gap-8 md:grid-cols-2">
          {t.stappen.map((s, i) => (
            <li key={s.titel}>
              <span className="num inline-grid h-10 w-10 place-items-center rounded-full bg-brand-500 font-mono text-base text-white">{i + 1}</span>
              <h3 className="mt-3 font-display text-2xl font-bold text-ink">{s.titel}</h3>
              <p className="mt-2 max-w-xl text-[1.02rem] leading-relaxed text-neutralx-600">{s.tekst}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="soft">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">{t.nodigKop}</h2>
            <ul className="mt-5 space-y-3">
              {t.nodig.map((n) => (
                <li key={n} className="flex gap-3 text-[0.975rem] leading-relaxed text-neutralx-600">
                  <span aria-hidden className="mt-0.5 font-bold text-brand-600">✓</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">{t.eerlijkKop}</h2>
            <ul className="mt-5 space-y-3">
              {eerlijk.map((n) => (
                <li key={n} className="flex gap-3 text-[0.975rem] leading-relaxed text-neutralx-600">
                  <span aria-hidden className="mt-0.5 font-bold text-neutralx-400">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHead title={t.faqKop} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
      </Section>

      <Section>
        <div className="grid items-center gap-10 overflow-hidden rounded-3xl bg-ink text-white md:grid-cols-2">
          <div className="p-8 md:p-12">
            <h2 className="font-display text-3xl font-bold leading-tight">{t.slotKop}</h2>
            <p className="mt-3 text-white/75">{t.slotTekst}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <TaalStartLink taal={taal} href="/register?type=freelancer" className="btn-mint">
                {t.knopStart}
              </TaalStartLink>
              <TaalStartLink taal={taal} href="/app" className="btn-ghost-invert">
                {t.knopApp}
              </TaalStartLink>
            </div>
          </div>
          <div className="relative h-64 md:h-full md:min-h-[320px]">
            <Image src={`${FOTO_MAP}/campagne-schap.jpg`} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-[50%_25%]" />
          </div>
        </div>
      </Section>
    </div>
  );
}
