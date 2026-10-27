import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import Link from "next/link";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { CITIES } from "@/lib/seo-cities";
import { SECTORS } from "@/lib/seo-sectors";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";

const TITLE = "Personeel inhuren in heel Nederland — klus plaatsen voor flex- en uitzendkrachten";
const DESCRIPTION =
  "Plaats een klus en huur flexkrachten, zzp'ers of uitzendkrachten in, door heel Nederland. Gematcht op reistijd en vak, € 3,50 per gewerkt uur, geen abonnement en Wet DBA-proof — het voordelige alternatief voor het uitzendbureau.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ZekerFlex` },
  description: DESCRIPTION,
  keywords: ["personeel inhuren", "klus plaatsen", "uitzendbureau", "uitzendbureau alternatief", "flexkrachten inhuren", "zzp'er inhuren", "tijdelijk personeel"],
  ...canonical("/personeel-inhuren", { title: TITLE, description: DESCRIPTION }),
};

export default function PersoneelInhurenPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Personeel inhuren", "/personeel-inhuren"]])) }}
      />
      <Section>
        <SectionHead
          eyebrow="Voor bedrijven"
          title="Personeel inhuren, door heel Nederland"
          intro="Plaats een klus en ZekerFlex vindt geverifieerde flexkrachten in de buurt van je locatie — zzp'ers, flexwerkers of uitzendkrachten via het ZekerFlex-uitzendbureau. Je betaalt € 3,50 per gewerkt uur, zonder abonnement."
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/register?type=bedrijf" className="btn-primary">
            Gratis klus plaatsen
          </Link>
          <Link href="/voor-bedrijven" className="btn-ghost">
            Hoe het werkt
          </Link>
        </div>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Personeel inhuren per stad</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CITIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/personeel-inhuren/${c.slug}`} className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                <span className="font-semibold text-ink">Personeel inhuren {c.name}</span>
                <span className="block text-xs text-neutralx-500">{c.sectors.slice(0, 3).join(", ")}</span>
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Personeel inhuren per sector</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SECTORS.map((s) => (
            <li key={s.slug}>
              <Link href={`/${s.slug}`} className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                <span className="font-semibold text-ink">{s.label} personeel inhuren</span>
                <span className="block text-xs text-neutralx-500">{s.rolesShort}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand
        title="Vandaag nog iemand nodig?"
        body="Plaats je klus in een paar minuten — je betaalt alleen voor gewerkte uren."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Klus plaatsen"
        secondaryHref="/prijzen"
        secondaryLabel="Prijzen"
      />
    </>
  );
}
