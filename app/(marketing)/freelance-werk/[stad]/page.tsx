import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { PublicShiftList } from "@/components/marketing/PublicShiftList";
import { publicOpenShifts } from "@/lib/public-shifts";
import { CITIES, RADIUS_KM, cityBySlug } from "@/lib/seo-cities";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";

export const revalidate = 900;
export const dynamicParams = false;

export function generateStaticParams() {
  return CITIES.map((c) => ({ stad: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ stad: string }> }): Promise<Metadata> {
  const c = cityBySlug((await params).stad);
  if (!c) return {};
  const title = `Freelance werk in ${c.name} — klussen, flexwerk & uitzendwerk`;
  const description = `Open klussen in ${c.name} en omgeving: ${c.sectors.join(", ")}. Reageer direct via ZekerFlex, werk wanneer jij wilt en kies zelf hoe snel je wordt uitbetaald — ook zonder KVK via ons uitzendbureau.`;
  return {
    title: { absolute: `${title} | ZekerFlex` },
    description,
    keywords: [`freelance werk ${c.name}`, `klussen ${c.name}`, `flexwerk ${c.name}`, `uitzendbureau ${c.name}`, `bijbaan ${c.name}`, `zzp opdrachten ${c.name}`],
    ...canonical(`/freelance-werk/${c.slug}`, { title, description }),
  };
}

export default async function FreelanceWerkStadPage({ params }: { params: Promise<{ stad: string }> }) {
  const c = cityBySlug((await params).stad);
  if (!c) notFound();
  const shifts = await publicOpenShifts({ near: { lat: c.lat, lng: c.lng, km: RADIUS_KM }, take: 30 });
  const faq = [
    {
      q: `Hoe vind ik freelance werk in ${c.name}?`,
      a: `Maak gratis een ZekerFlex-account, vul je vak en je thuisbasis in en je ziet direct de open klussen in ${c.name} en tot ${RADIUS_KM} km daaromheen, gesorteerd op reistijd. Je krijgt ook een melding zodra er nieuw werk bij je past.`,
    },
    {
      q: `Kan ik in ${c.name} werken zonder KVK-nummer?`,
      a: "Ja. Via het ZekerFlex-uitzendbureau werk je als uitzendkracht: geen KVK nodig, wekelijks loon met vakantiegeld, pensioen (StiPP) en reiskosten. Heb je wel een KVK- of EU-btw-nummer, dan werk je als zzp'er.",
    },
    {
      q: "Hoe snel word ik uitbetaald?",
      a: "Dat kies je zelf per klus: direct na goedkeuring van je uren, binnen 3 werkdagen of gratis binnen 30 dagen. Je hoeft zelf geen facturen te sturen.",
    },
    {
      q: `Welk werk is er veel in ${c.name}?`,
      a: `In ${c.name} is er vooral vraag in ${c.sectors.join(", ")}. ${c.local}`,
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            breadcrumbJsonLd([["Home", "/"], ["Klussen", "/klussen"], [`Freelance werk ${c.name}`, `/freelance-werk/${c.slug}`]]),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]),
        }}
      />
      <Section>
        <SectionHead
          eyebrow={`${c.name} · ${c.province}`}
          title={`Freelance werk in ${c.name}`}
          intro={`${c.local} Op ZekerFlex vind je klussen in ${c.sectors.join(", ")} — reageer direct en kies zelf hoe snel je wordt uitbetaald.`}
        />
        <h2 className="mt-12 font-display text-xl font-bold text-ink">
          Open klussen in en rond {c.name}
          {shifts.length > 0 ? ` (${shifts.length})` : ""}
        </h2>
        <div className="mt-4">
          <PublicShiftList
            shifts={shifts}
            empty={`Op dit moment staan er geen open klussen binnen ${RADIUS_KM} km van ${c.name}. Maak een gratis account aan — je krijgt meteen een melding zodra er werk bij jou in de buurt is.`}
          />
        </div>
        <p className="mt-6 text-sm text-neutralx-600">
          Liever zonder KVK werken?{" "}
          <Link href="/uitzendbureau" className="font-medium text-brand-600 hover:underline">
            Werk via het ZekerFlex-uitzendbureau
          </Link>
          . Ben je een bedrijf in {c.name}?{" "}
          <Link href={`/personeel-inhuren/${c.slug}`} className="font-medium text-brand-600 hover:underline">
            Huur hier flexkrachten in
          </Link>
          .
        </p>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`Werken in ${c.name} via ZekerFlex`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
        <h2 className="mt-14 font-display text-lg font-bold text-ink">Ook in andere steden</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CITIES.filter((x) => x.slug !== c.slug).map((x) => (
            <li key={x.slug}>
              <Link href={`/freelance-werk/${x.slug}`} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
                {x.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand
        title={`Begin vandaag met werken in ${c.name}`}
        body="Gratis account, binnen een paar minuten geverifieerd. Reageer op klussen en kies zelf je uitbetaling."
        primaryHref="/register?type=freelancer"
        primaryLabel="Gratis account maken"
        secondaryHref="/klussen"
        secondaryLabel="Alle klussen"
      />
    </>
  );
}
