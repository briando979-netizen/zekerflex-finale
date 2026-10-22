import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import Link from "next/link";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { PublicShiftList } from "@/components/marketing/PublicShiftList";
import { publicOpenShifts } from "@/lib/public-shifts";
import { CITIES } from "@/lib/seo-cities";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";

export const revalidate = 600;

const TITLE = "Klussen in heel Nederland — freelance werk, flexwerk & uitzendwerk";
const DESCRIPTION =
  "Bekijk alle open klussen op ZekerFlex: freelance werk, flexwerk en uitzendwerk in heel Nederland. Horeca, logistiek, retail, evenementen en meer — reageer direct en kies zelf hoe snel je wordt uitbetaald.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ZekerFlex` },
  description: DESCRIPTION,
  keywords: ["klussen", "freelance werk", "flexwerk", "uitzendwerk", "klussen in de buurt", "bijbaan", "zzp opdrachten", "werk vandaag"],
  ...canonical("/klussen", { title: TITLE, description: DESCRIPTION }),
};

export default async function KlussenPage() {
  const shifts = await publicOpenShifts({ take: 60 });
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], ["Klussen", "/klussen"]]),
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: "Open klussen op ZekerFlex",
              itemListElement: shifts.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE.url}/klussen/${s.id}`, name: s.title })),
            },
          ]),
        }}
      />
      <Section>
        <SectionHead
          eyebrow="Open klussen"
          title="Klussen in heel Nederland"
          intro="Freelance werk, flexwerk en uitzendwerk — van één avond in de horeca tot een week orderpicken. Maak gratis een account, reageer en kies per klus hoe snel je wordt uitbetaald."
        />
        <div className="mt-10">
          <PublicShiftList
            shifts={shifts}
            empty="Er staan op dit moment geen open klussen online. Maak een account aan: je krijgt een melding zodra er werk bij jou in de buurt is."
          />
        </div>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Klussen per stad</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {CITIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/freelance-werk/${c.slug}`} className="inline-block rounded-full border border-hairstrong bg-white px-3.5 py-1.5 text-sm text-neutralx-700 hover:border-brand-500">
                Freelance werk {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand
        title="Zelf een klus plaatsen?"
        body="Bedrijven plaatsen een klus in een paar minuten en betalen € 3,50 per gewerkt uur — geen abonnement, geen uitzendmarge."
        primaryHref="/register"
        primaryLabel="Gratis account maken"
        secondaryHref="/voor-bedrijven"
        secondaryLabel="Voor bedrijven"
      />
    </>
  );
}
