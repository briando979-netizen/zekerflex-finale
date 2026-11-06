import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/marketing/primitives";
import { NewsletterSignup } from "@/components/marketing/NewsletterSignup";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

// De aanmeldpagina voor de nieuwsbrief. Het formulier staat ook in de voettekst
// en in de shop; deze pagina is de vaste plek waar de app en mails naartoe linken
// (Account → "Join de community" wees hier eerder naar een 404).

const PATH = "/nieuwsbrief";

export const metadata: Metadata = {
  title: "Nieuwsbrief — nieuws over flexwerk, klussen en ZekerFlex",
  description: "Eens per maand het belangrijkste over flexwerk, nieuwe functies van ZekerFlex en tips voor opdrachtgevers en flexwerkers. Gratis, afmelden kan altijd met één klik.",
  ...canonical(PATH),
};

export default function NieuwsbriefPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Nieuwsbrief", PATH]])) }} />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">Nieuwsbrief</p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">Blijf op de hoogte</h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Eens per maand: wat er nieuw is op ZekerFlex, welke klussen en branches in beweging zijn, en praktische tips voor opdrachtgevers en flexwerkers. Geen reclame van anderen, afmelden met één klik.
          </p>
        </div>
      </div>

      <Section tone="soft">
        {/* het formulier is gemaakt voor de donkere voettekst: hier dus ook een donker vlak */}
        <div className="hero-ink mx-auto max-w-xl rounded-3xl p-6 text-white shadow-card md:p-8">
          <h2 className="font-display text-xl font-bold">Meld je aan</h2>
          <p className="mt-2 text-sm text-white/70">Je krijgt eerst een mail om je adres te bevestigen. Lees hoe we met je gegevens omgaan in het{" "}
            <Link href="/privacy" className="font-semibold text-brand-mint underline">
              privacybeleid
            </Link>
            .
          </p>
          <div className="mt-5">
            <NewsletterSignup source="pagina" />
          </div>
        </div>
      </Section>
    </>
  );
}
