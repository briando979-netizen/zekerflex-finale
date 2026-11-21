import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/marketing/primitives";
import { NewsletterSignup } from "@/components/marketing/NewsletterSignup";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { JONGEREN_BRON, JONGEREN_TOESTEMMING } from "@/lib/marketing/jongeren";

const PATH = "/nog-geen-18";
const title = "Nog geen 18? Laat je e-mailadres achter";
const description =
  "Werken via ZekerFlex kan vanaf 18 jaar. Ben je 16 of 17, laat dan je e-mailadres achter: we sturen je een bericht zodra je bij ons aan de slag kunt.";

export const metadata: Metadata = {
  title,
  description,
  ...canonical(PATH, { title, description }),
};

// /nog-geen-18 (21 nov 2026, eigenaar: een meisje van 16 kreeg van de assistent "alleen vanaf 18, veel succes" en was weg). Werken kan
// vanaf 18; wie 16 of 17 is, mag in Nederland zelf toestemming geven om haar e-mailadres te bewaren (AVG, Uitvoeringswet: 16 jaar).
// Dat gaat via de nieuwsbrief met dubbele bevestiging en afmelden met één klik, met een eigen bron (lib/marketing/jongeren.ts), zodat
// we deze groep apart kunnen mailen. Onder de 16 vragen we niets. Klussen voor 16 en 17 jaar via een uitzendbureau zijn een idee voor
// later (geheugennotitie jongeren-16-17); niets beloven wat er nog niet is.

export default function NogGeen18Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Nog geen 18?", PATH]])) }} />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">Nog geen 18?</p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">Leuk dat je wilt werken!</h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Werken via ZekerFlex kan vanaf 18 jaar. Ben je 16 of 17? Laat je e-mailadres achter. Dan sturen we je een bericht zodra je bij
            ons aan de slag kunt.
          </p>
        </div>
      </div>

      <Section tone="soft">
        <div className="hero-ink mx-auto max-w-xl rounded-3xl p-6 text-white shadow-card md:p-8">
          <h2 className="font-display text-xl font-bold">Ik ben 16 of 17</h2>
          <p className="mt-2 text-sm text-white/70">
            Je krijgt eerst een mail om je adres te bevestigen. We gebruiken je adres alleen om je te laten weten dat je aan de slag kunt, en
            afmelden kan altijd met één klik.
          </p>
          <div className="mt-5">
            <NewsletterSignup source={JONGEREN_BRON} toestemming={JONGEREN_TOESTEMMING} />
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-xl text-sm leading-relaxed text-neutralx-600">
          <p>
            <strong className="text-ink">Jonger dan 16?</strong> Dan vragen we nu nog niets van je. Kom gerust terug als je ouder bent.
          </p>
          <p className="mt-3">
            Vragen? Mail{" "}
            <a href="mailto:info@zekerflex.com" className="font-semibold text-brand-600 underline">
              info@zekerflex.com
            </a>{" "}
            of lees hoe we met gegevens omgaan in het{" "}
            <Link href="/privacy" className="font-semibold text-brand-600 underline">
              privacybeleid
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
