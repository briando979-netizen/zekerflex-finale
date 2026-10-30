import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { PublicShiftList } from "@/components/marketing/PublicShiftList";
import { publicOpenShifts } from "@/lib/public-shifts";
import { CITIES } from "@/lib/seo-cities";
import { SECTORS } from "@/lib/seo-sectors";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";

export const revalidate = 600;

const TITLE = "Freelance werk in Nederland — klussen voor zzp'ers, flexwerkers en uitzendkrachten";
const DESCRIPTION =
  "Freelance werk vinden in heel Nederland: open klussen in horeca, logistiek, retail, evenementen en zorg. Met KVK of btw-nummer als zzp'er, of zonder KVK via het ZekerFlex-uitzendbureau. Gratis aanmelden, zelf je uitbetaling kiezen.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ZekerFlex` },
  description: DESCRIPTION,
  keywords: ["freelance werk", "freelance werk vinden", "freelance klussen", "zzp opdrachten", "flexwerk", "werk zonder KVK", "freelance werk Nederland"],
  ...canonical("/freelance-werk", { title: TITLE, description: DESCRIPTION }),
};

const FAQ = [
  {
    q: "Waar vind ik freelance werk in Nederland?",
    a: "Op ZekerFlex staan open klussen van bedrijven door heel Nederland — van horeca en evenementen tot logistiek en retail. Je maakt gratis een account, geeft je vak en thuisbasis op en reageert direct op klussen die bij je passen.",
  },
  {
    q: "Heb ik een KVK-nummer nodig?",
    a: "Niet per se. Met een KVK-nummer of een EU-btw-nummer werk je als zzp'er. Zonder KVK werk je als uitzendkracht via het ZekerFlex-uitzendbureau, met loon, vakantiegeld en pensioen.",
  },
  {
    q: "Wat kost het voor freelancers?",
    a: "Niets. Aanmelden en reageren is gratis. Alleen als je kiest voor snellere uitbetaling betaal je een kleine fee per klus; wachten tot de opdrachtgever betaalt is gratis.",
  },
];

export default async function FreelanceWerkPage() {
  const shifts = await publicOpenShifts({ take: 12 }).catch(() => []);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], ["Freelance werk", "/freelance-werk"]]),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]),
        }}
      />
      <Section>
        <SectionHead
          eyebrow="Freelance werk"
          title="Freelance werk in heel Nederland"
          intro="ZekerFlex verbindt freelancers, flexwerkers en uitzendkrachten met bedrijven door het hele land. Slim gematcht op reistijd en vak, en jij kiest per klus hoe snel je wordt uitbetaald."
        />
        <h2 className="mt-12 font-display text-xl font-bold text-ink">Nieuwste klussen</h2>
        <div className="mt-4">
          <PublicShiftList shifts={shifts} empty="Er staan nu geen open klussen online — maak een account aan en krijg een melding zodra er werk bij je in de buurt is." />
        </div>
        <p className="mt-4 text-sm">
          <Link href="/klussen" className="font-medium text-brand-600 hover:underline">
            Bekijk alle open klussen →
          </Link>
        </p>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Freelance werk per stad</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CITIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/freelance-werk/${c.slug}`} className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                <span className="font-semibold text-ink">Freelance werk {c.name}</span>
                <span className="block text-xs text-neutralx-500">{c.sectors.slice(0, 3).join(", ")}</span>
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Freelance werk per sector</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SECTORS.map((s) => (
            <li key={s.workerSlug}>
              <Link href={`/${s.workerSlug}`} className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                <span className="font-semibold text-ink">Werken in de {s.label.toLowerCase()}</span>
                <span className="block text-xs text-neutralx-500">{s.rolesShort}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Freelance werken via ZekerFlex" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={FAQ} />
        </div>
      </Section>
      <CtaBand
        title="Vind vandaag nog een klus"
        body="Gratis account, KVK of btw-nummer koppelen (of zonder KVK via ons uitzendbureau) en direct reageren."
        primaryHref="/register?type=freelancer"
        primaryLabel="Gratis account maken"
        secondaryHref="/uitzendbureau"
        secondaryLabel="Werken zonder KVK"
      />
    </>
  );
}
