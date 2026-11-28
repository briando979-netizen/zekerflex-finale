import { vt } from "@/lib/i18n/site";
import { getSiteT } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { zichtbareSecties } from "@/lib/ontwerp/vaste-paginas";
import { getPaginaIndeling } from "@/lib/ontwerp/vaste-paginas-store";
import Link from "next/link";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { FotoKolom, HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { paginaFoto } from "@/lib/marketing/fotos";
import { canonical, CONTACTS, GOOGLE_PROFIEL, SITE } from "@/lib/seo";
import { COMMUNITY_URL } from "@/lib/hulp/hulpjes";

const TITLE = "Contact — ZekerFlex";
const DESCRIPTION =
  "Neem contact op met ZekerFlex: algemene vragen, support, sales, partners/API-toegang, privacy, beveiliging of pers. Of vraag direct een demo aan.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/contact", { title: TITLE, description: DESCRIPTION }),
};

const CHANNELS: { label: string; email: string; body: string }[] = [
  { label: vt("Algemeen"), email: CONTACTS.general, body: vt("Voor alle vragen die nergens anders onder vallen.") },
  { label: vt("Support"), email: CONTACTS.support, body: vt("Al een account? Vragen over je dienst, uitbetaling of verificatie.") },
  { label: vt("Sales"), email: CONTACTS.sales, body: vt("Personeel inhuren, een demo plannen of een offerte op maat.") },
  { label: vt("Partners & API"), email: CONTACTS.partners, body: vt("Een integratie bouwen op onze publieke API, of een API-sleutel aanvragen.") },
  { label: vt("Privacy"), email: CONTACTS.privacy, body: vt("Vragen over je gegevens, een verzoek tot inzage of verwijdering.") },
  { label: vt("Beveiliging"), email: CONTACTS.security, body: vt("Een kwetsbaarheid melden of een beveiligingsvraag.") },
  { label: vt("Pers"), email: CONTACTS.pers, body: vt("Persvragen en mediaverzoeken.") },
  { label: vt("Werken bij ons"), email: CONTACTS.werkenbij, body: vt("Open sollicitatie — zie ook /over-ons.") },
];

export default async function ContactPage() {
  const tx = await getSiteT();
  // de onderdelen onder de kop: volgorde en zichtbaarheid uit de Site-ontwerper (Pagina's); zonder eigen indeling exact de standaard
  const onderdelen: Record<string, ReactNode> = {
    email: (
      <Section tone="paper">
        <SectionHead eyebrow={tx("E-mail")} title={tx("Kies het juiste onderwerp")} />
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <div key={c.email} className="card p-5">
              <h3 className="font-display text-base font-semibold text-ink">{tx(c.label)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{tx(c.body)}</p>
              <a href={`mailto:${c.email}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
                {c.email}
              </a>
            </div>
          ))}
        </div>
      </Section>
    ),
    direct: (
      <Section tone="soft">
        <SectionHead
          eyebrow={tx("Liever direct praten")}
          title={tx("Plan een demo of dien een klacht in")}
          intro={tx("Voor werkgevers die willen zien hoe het platform werkt, of voor een formele klacht, hebben we een directe route.")}
        />
        <div className="mt-8 flex flex-wrap gap-4">
          <a href={SITE.phoneHref} className="btn-primary">
            📞 Bel ons: {SITE.phone}
          </a>
          <Link href="/demo" className="btn-ghost">
            {tx("Vraag een demo aan")}
          </Link>
          <a href={`mailto:${CONTACTS.klachten}`} className="btn-ghost">
            Klacht indienen ({CONTACTS.klachten})
          </a>
          <Link href={COMMUNITY_URL} className="btn-ghost">
            {tx("Praat mee in de ZekerFlex community")}
          </Link>
        </div>
      </Section>
    ),
    google: (
      <Section tone="paper">
        <SectionHead
          eyebrow={tx("Op Google")}
          title={tx("Al met ZekerFlex gewerkt?")}
          intro={tx("Vertel op Google hoe het ging. Je review helpt andere bedrijven en flexkrachten om ons te vinden, ook als er iets beter kan.")}
        />
        <div className="mt-8 flex flex-wrap gap-4">
          <a href={GOOGLE_PROFIEL.review} target="_blank" rel="noopener noreferrer" className="btn-primary">
            {tx("Schrijf een review op Google")}
          </a>
          <a href={GOOGLE_PROFIEL.kaart} target="_blank" rel="noopener noreferrer" className="btn-ghost">
            {tx("Bekijk ons op Google Maps")}
          </a>
        </div>
      </Section>
    ),
  };
  const zichtbaar = zichtbareSecties("contact", await getPaginaIndeling("contact"));
  return (
    <>
      <div className="hero-ink text-white">
      <div className="shell grid items-center gap-10 py-20 md:py-24 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="eyebrow text-brand-mint">{tx("Contact")}</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            {tx("Waar kunnen we mee helpen?")}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            {SITE.name} is een bedrijf van Zekerflex, Inc. (Delaware, VS). Hieronder het
            juiste adres per onderwerp — zo komt je vraag meteen bij de juiste persoon terecht.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={SITE.phoneHref}
              className="inline-flex items-center gap-2.5 rounded-full bg-brand-mint px-6 py-3.5 font-display text-lg font-bold text-ink shadow-lift transition hover:brightness-95"
            >
              <span aria-hidden>📞</span> {SITE.phone}
            </a>
            <span className="text-sm text-white/60">{tx("Neem contact op — onze assistent neemt 24/7 op.")}</span>
          </div>
        </div>
        <FotoKolom foto={paginaFoto("contact")} />
        </div>
      </div>

      {zichtbaar.map((id) => (
        <Fragment key={id}>{onderdelen[id]}</Fragment>
      ))}
    </>
  );
}
