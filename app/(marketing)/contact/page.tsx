import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { canonical, CONTACTS, SITE } from "@/lib/seo";

const TITLE = "Contact — ZekerFlex";
const DESCRIPTION =
  "Neem contact op met ZekerFlex: algemene vragen, support, sales, partners/API-toegang, privacy, beveiliging of pers. Of vraag direct een demo aan.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/contact", { title: TITLE, description: DESCRIPTION }),
};

const CHANNELS: { label: string; email: string; body: string }[] = [
  { label: "Algemeen", email: CONTACTS.general, body: "Voor alle vragen die nergens anders onder vallen." },
  { label: "Support", email: CONTACTS.support, body: "Al een account? Vragen over je dienst, uitbetaling of verificatie." },
  { label: "Sales", email: CONTACTS.sales, body: "Personeel inhuren, een demo plannen of een offerte op maat." },
  { label: "Partners & API", email: CONTACTS.partners, body: "Een integratie bouwen op onze publieke API, of een API-sleutel aanvragen." },
  { label: "Privacy", email: CONTACTS.privacy, body: "Vragen over je gegevens, een verzoek tot inzage of verwijdering." },
  { label: "Beveiliging", email: CONTACTS.security, body: "Een kwetsbaarheid melden of een beveiligingsvraag." },
  { label: "Pers", email: CONTACTS.pers, body: "Persvragen en mediaverzoeken." },
  { label: "Werken bij ons", email: CONTACTS.werkenbij, body: "Open sollicitatie — zie ook /over-ons." },
];

export default function ContactPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Contact</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Waar kunnen we mee helpen?
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            {SITE.name} is een Nederlands bedrijf (ZekerFlex B.V., gevestigd in Amsterdam). Hieronder het
            juiste adres per onderwerp — zo komt je vraag meteen bij de juiste persoon terecht.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="E-mail" title="Kies het juiste onderwerp" />
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <div key={c.email} className="card p-5">
              <h3 className="font-display text-base font-semibold text-ink">{c.label}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{c.body}</p>
              <a href={`mailto:${c.email}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
                {c.email}
              </a>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead
          eyebrow="Liever direct praten"
          title="Plan een demo of dien een klacht in"
          intro="Voor werkgevers die willen zien hoe het platform werkt, of voor een formele klacht, hebben we een directe route."
        />
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/demo" className="btn-primary">
            Vraag een demo aan
          </Link>
          <a href={`mailto:${CONTACTS.klachten}`} className="btn-ghost">
            Klacht indienen ({CONTACTS.klachten})
          </a>
        </div>
      </Section>
    </>
  );
}
