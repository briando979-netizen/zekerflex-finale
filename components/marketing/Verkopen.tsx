import Link from "next/link";
import { CtaBand, FaqList, Section, SectionHead } from "@/components/marketing/primitives";
import { breadcrumbJsonLd } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { RUBRIEKEN, VERKOPEN_PAD, VERKOPEN_START_PAD, rubriek, rubriekPad, type RubriekSlug } from "@/lib/shop/partnerplatform";

// Het Partnerplatform (/verkopen, 18 nov 2026): gedeelde onderdelen voor de uitleg aan verkopers op de marktplaats.
// Servercomponenten, geen scripts. De inhoud en alle getallen staan in lib/shop/partnerplatform.ts.

/** Het bovenmenu van het Partnerplatform: de rubrieken naast elkaar, op de telefoon een rij die je veegt. */
export function VerkopenNav({ actief }: { actief?: RubriekSlug | "start" | "home" }) {
  const link = (aan: boolean) =>
    `inline-flex h-10 shrink-0 items-center rounded-lg px-3 text-sm font-semibold transition ${aan ? "bg-ink text-white" : "text-ink hover:bg-paper-soft"}`;
  return (
    <nav aria-label="Partnerplatform" className="border-b border-hair bg-white">
      <div className="shell flex items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
        <Link href={VERKOPEN_PAD} className={link(actief === "home")} aria-current={actief === "home" ? "page" : undefined}>
          Partnerplatform
        </Link>
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-hair" />
        {RUBRIEKEN.map((r) => (
          <Link key={r.slug} href={rubriekPad(r.slug)} className={link(actief === r.slug)} aria-current={actief === r.slug ? "page" : undefined}>
            {r.naam}
          </Link>
        ))}
        <Link href={VERKOPEN_START_PAD} className="btn-primary ml-auto shrink-0 !px-4 !py-2 text-sm" aria-current={actief === "start" ? "page" : undefined}>
          Start met verkopen
        </Link>
      </div>
    </nav>
  );
}

/** Een genummerd rondje voor een stap. */
export function StapNummer({ n }: { n: number }) {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-white">
      {n}
    </span>
  );
}

/** Eén uitlegpagina van een rubriek (Beleid, Aanbod, …), met de echte regels en de vragen eronder. */
export function VerkopenRubriekPagina({ slug }: { slug: RubriekSlug }) {
  const r = rubriek(slug);
  const vragen = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: r.vragen.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  const kruimels = breadcrumbJsonLd([
    ["Home", "/"],
    ["Partnerplatform", VERKOPEN_PAD],
    [r.naam, rubriekPad(r.slug)],
  ]);
  const andere = RUBRIEKEN.filter((x) => x.slug !== r.slug);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson([kruimels, vragen]) }} />
      <VerkopenNav actief={r.slug} />
      <Section tone="paper">
        <p className="text-sm text-neutralx-500">
          <Link href={VERKOPEN_PAD} className="hover:underline">
            Partnerplatform
          </Link>{" "}
          <span aria-hidden>›</span> {r.naam}
        </p>
        <div className="mt-4">
          <SectionHead kop="h1" eyebrow={`Verkopen via ZekerFlex · ${r.naam}`} title={r.titel} intro={r.kort} />
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {r.blokken.map((b) => (
            <div key={b.kop} className="rounded-2xl border border-hair bg-white p-6">
              <h2 className="font-display text-lg font-bold text-ink">{b.kop}</h2>
              {b.tekst ? <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{b.tekst}</p> : null}
              {b.punten ? (
                <ul className="mt-3 space-y-2 text-[0.975rem] leading-relaxed text-neutralx-600">
                  {b.punten.map((p) => (
                    <li key={p} className="flex gap-3">
                      <span aria-hidden className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`Vragen over ${r.naam.toLowerCase()}`} />
        <div className="mt-8">
          <FaqList items={r.vragen} />
        </div>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Verder lezen" title="De andere rubrieken" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {andere.map((x) => (
            <Link key={x.slug} href={rubriekPad(x.slug)} className="rounded-2xl border border-hair bg-white p-5 transition hover:border-ink">
              <p className="font-display text-base font-bold text-ink">{x.naam}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{x.kort}</p>
            </Link>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Klaar om te verkopen?"
        body="Meld je bedrijf aan en zet je eerste product in de ZekerFlex-shop, onder je eigen naam."
        primaryHref={VERKOPEN_START_PAD}
        primaryLabel="Start met verkopen"
        secondaryHref={VERKOPEN_PAD}
        secondaryLabel="Naar het Partnerplatform"
      />
    </>
  );
}
