import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { paginaFoto } from "@/lib/marketing/fotos";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { prisma } from "@/lib/prisma";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { zonderEigenTestAccounts } from "@/lib/admin/eigen-test-regel";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { PARTNER_VOORWAARDEN_PAD, TERMIJN } from "@/lib/uitzend/voorwaarden";

const title = "Samenwerken met ZekerFlex: voor uitzendbureaus";
const description =
  "Een uitnodiging voor uitzendbureaus: zet je diensten onder je eigen naam in de ZekerFlex-app. Werkers melden zich aan, jij neemt ze aan op je eigen contract.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["samenwerken uitzendbureau", "uitzendpartner", "meer uitzendkrachten", "uitzendkrachten vinden", "flexwerkers app"],
  ...canonical("/partners/uitzend", { title, description }),
};

// de cijfers komen bij elk bezoek uit de database (geen bouwtijd-cijfers zonder database)
export const dynamic = "force-dynamic";

// /partners/uitzend (21 nov 2026, eigenaar: "bouw die pagina uitnodigend als ze kijken, zoals het bericht voor
// samenwerking"). De pagina achter de link in het voorstel aan uitzendbureaus. Alleen wat er echt is: de cijfers komen
// live uit de database en verdwijnen als die niet bereikbaar is; geen verzonnen bureaus, citaten of plaatsingen.

const euro = (cent: number) => `€ ${(cent / 100).toFixed(2).replace(".", ",")}`;

const VOORDELEN = [
  {
    titel: "Meer kandidaten",
    tekst: "Je klussen staan in de app tussen het werk dat flexwerkers elke dag bekijken. Zo bereik je mensen die je via een vacaturesite niet ziet.",
  },
  {
    titel: "Onder je eigen naam",
    tekst: "Op elke klus staat de naam van je bureau. De werker weet vanaf het begin dat hij een uitzendcontract bij jou krijgt.",
  },
  {
    titel: "Werkers met een gecontroleerd ID",
    tekst: "Werkers laten hun identiteitsbewijs in de app controleren. Je ziet wie er reageert voordat je een contract maakt.",
  },
  {
    titel: "Geen eigen app nodig",
    tekst: "De app, het matchen, het inchecken en de urenregistratie regelt ZekerFlex. Jij doet waar je goed in bent: het contract en de verloning.",
  },
];

const STAPPEN = [
  { titel: "Kennismaken", tekst: "Een kort gesprek: wat voor werk je hebt, in welke regio en hoe je nu aan kandidaten komt." },
  { titel: "Je account wordt uitzendpartner", tekst: "Je maakt een gratis bedrijfsaccount aan. Na een korte controle van je inschrijving als uitlener zetten wij het op uitzendpartner." },
  { titel: "Je plaatst je eerste klus", tekst: "De klus staat in de app als uitzendklus, onder de naam van je bureau, en wordt getoond aan werkers die erbij passen." },
  { titel: "Werkers melden zich aan", tekst: "Een werker ziet je dienst in de app en meldt zich aan. Jij krijgt zijn naam, e-mailadres en telefoonnummer per mail, belt hem en neemt hem aan op je eigen uitzendcontract." },
];

const VERDELING = [
  { wie: "Jouw bureau", punten: ["Is de werkgever van de uitzendkracht", "Tekent het uitzendcontract", "Betaalt het loon en regelt de verloning", "Volgt de cao en de regels voor uitleners"] },
  { wie: "ZekerFlex", punten: ["Zet je klussen in de app, onder jouw naam", "Laat ze zien aan werkers die erbij passen", "Controleert de identiteit van werkers", "Regelt het inchecken en de urenregistratie"] },
];

const FAQ = [
  {
    q: "Wat kost het?",
    a: `${euro(BASE_FEE_PER_HOUR_CENTS)} per gewerkt uur, alleen als er echt gewerkt is. Geen abonnement, geen plaatsingskosten en geen kosten om te beginnen.`,
  },
  {
    q: "Wie is de werkgever?",
    a: "Jouw bureau. De werker tekent zijn uitzendcontract bij jou en jij betaalt het loon. ZekerFlex is bij deze klussen geen werkgever en geen uitlener.",
  },
  {
    q: "Zit ik ergens aan vast?",
    a: `Nee. Je kunt de samenwerking altijd opzeggen, met een opzegtermijn van ${TERMIJN.opzegMaanden} maand. De afspraken staan in de partnervoorwaarden.`,
  },
  {
    q: "Welke gegevens van een werker krijg ik?",
    a: "Als een werker zich voor je dienst aanmeldt, geeft hij toestemming om zijn naam, e-mailadres en telefoonnummer met je bureau te delen. Daarmee neem je contact op.",
  },
];

/** Live cijfers voor op de pagina; null als de database niet bereikbaar is (dan blijft het blok weg). Testadressen en eigen-test-accounts tellen niet mee. */
async function liveCijfers(): Promise<{ werkers: number; metId: number } | null> {
  try {
    const echt = { disabledAt: null, NOT: { email: { endsWith: ".test" } }, ...zonderEigenTestAccounts(await leesEigenTest()) };
    const [werkers, metId] = await Promise.all([
      prisma.freelancerProfile.count({ where: { user: echt } }),
      prisma.user.count({ where: { ...echt, kycStatus: "VERIFIED", freelancerProfile: { isNot: null } } }),
    ]);
    return { werkers, metId };
  } catch {
    return null;
  }
}

export default async function PartnersUitzendPage() {
  const cijfers = await liveCijfers();
  const vragen = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson([breadcrumbJsonLd([["Home", "/"], ["Samenwerken met uitzendbureaus", "/partners/uitzend"]]), vragen]) }}
      />
      <Section>
        <HeroMetFoto foto={paginaFoto("uitzendpartner")}>
          <SectionHead
            kop="h1"
            eyebrow="Uitnodiging voor uitzendbureaus"
            title="Laten we samenwerken"
            intro="Zet je diensten in de ZekerFlex-app, onder de naam van je bureau. Werkers in de app zien jouw dienst en melden zich er meteen voor aan. Jij neemt ze aan op je eigen uitzendcontract en regelt het loon zoals je gewend bent. Wij leveren de app, de werkers en het matchen."
          />
          <div className="mt-10 flex flex-wrap gap-3">
            <a href="mailto:uitzendbureau@zekerflex.com?subject=Kennismaking%20uitzendpartner" className="btn-primary">
              Plan een kennismaking
            </a>
            <Link href="/register?type=bedrijf" className="btn-ghost">
              Maak een gratis account
            </Link>
          </div>
          <p className="mt-4 text-sm text-neutralx-500">Mail ons wie we kunnen bellen en wanneer het uitkomt. We bellen je terug.</p>
        </HeroMetFoto>
      </Section>

      {cijfers && cijfers.werkers >= 10 && (
        <Section tone="soft">
          <SectionHead eyebrow="Nu op ZekerFlex" title="Werkers die je klussen kunnen zien" />
          <dl className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-hair bg-white p-6">
              <dt className="text-sm text-neutralx-600">Werkers met een profiel</dt>
              <dd className="num mt-1 font-display text-4xl font-bold text-ink">{cijfers.werkers}</dd>
            </div>
            <div className="rounded-2xl border border-hair bg-white p-6">
              <dt className="text-sm text-neutralx-600">Met een gecontroleerd ID</dt>
              <dd className="num mt-1 font-display text-4xl font-bold text-ink">{cijfers.metId}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-neutralx-500">Deze cijfers komen rechtstreeks uit ZekerFlex en groeien elke week.</p>
        </Section>
      )}

      <Section>
        <SectionHead eyebrow="Wat het je oplevert" title="Meer kandidaten, zonder eigen app" />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {VOORDELEN.map((v) => (
            <div key={v.titel} className="rounded-2xl border border-hair bg-white p-6">
              <h3 className="font-display text-lg font-semibold text-ink">{v.titel}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-neutralx-600">{v.tekst}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Zo begin je" title="In vier stappen je eerste uitzendklus" />
        <ol className="mt-10 grid gap-6 md:grid-cols-2">
          {STAPPEN.map((s, i) => (
            <li key={s.titel} className="flex gap-4">
              <span className="num flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 font-mono text-sm text-white">{i + 1}</span>
              <div>
                <h3 className="font-display text-lg font-semibold">{s.titel}</h3>
                <p className="mt-1 text-[0.95rem] leading-relaxed text-neutralx-600">{s.tekst}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHead eyebrow="Wie doet wat" title="Jij de werkgever, wij de app" />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {VERDELING.map((v) => (
            <div key={v.wie} className="rounded-2xl border border-hair bg-white p-6">
              <h3 className="font-display text-xl font-bold text-ink">{v.wie}</h3>
              <ul className="mt-4 space-y-2">
                {v.punten.map((p) => (
                  <li key={p} className="flex gap-3 text-sm text-neutralx-700">
                    <span aria-hidden className="font-bold text-brand-600">
                      ✓
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Goed om te weten" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={FAQ} />
        </div>
        <p className="mt-8 text-sm text-neutralx-500">
          Alle afspraken staan in de{" "}
          <Link href={PARTNER_VOORWAARDEN_PAD} className="text-brand-600 underline">
            partnervoorwaarden voor uitzendbureaus
          </Link>
          . Meer uitleg over hoe het werkt:{" "}
          <Link href="/uitzendpartner" className="text-brand-600 underline">
            uitzendpartner worden
          </Link>
          .
        </p>
      </Section>

      <CtaBand
        title="Zullen we even bellen?"
        body="Mail ons wie we kunnen bellen en wanneer het uitkomt. In een kwartier weet je of het bij je bureau past."
        primaryHref="mailto:uitzendbureau@zekerflex.com?subject=Kennismaking%20uitzendpartner"
        primaryLabel="Plan een kennismaking"
        secondaryHref="/register?type=bedrijf"
        secondaryLabel="Maak een gratis account"
      />
    </>
  );
}
