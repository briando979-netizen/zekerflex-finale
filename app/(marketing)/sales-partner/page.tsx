import type { Metadata } from "next";
import { Section, SectionHead, CtaBand, FaqList, Stat } from "@/components/marketing/primitives";
import { canonical } from "@/lib/seo";
import { SalesPartnerForm } from "@/components/marketing/SalesPartnerForm";
import {
  SALES_PARTNER,
  HOW_IT_WORKS,
  SALES_PARTNER_FAQ,
  PLATFORM_FEE_PER_HOUR_EUR,
  sharePerHourEur,
  monthlyFromClientEur,
} from "@/lib/sales-partner";

const title = "Word sales-partner — verdien mee op commissie";
const description =
  "Breng als zzp'er bedrijven binnen bij ZekerFlex en verdien op commissie: een aanbrengbonus plus doorlopende commissie over elk gewerkt uur, een jaar lang. Je wordt alleen uit echt verdiende fee betaald — geen vaste uren, geen target, uncapped.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["sales op commissie", "acquisitie zzp", "commissie sales baan", "partner worden", "bijverdienen sales"],
  ...canonical("/sales-partner", { title, description }),
};

const euro0 = (n: number) => `€ ${n.toFixed(0)}`;
const euro2 = (n: number) => `€ ${n.toFixed(2).replace(".", ",")}`;

export default function SalesPartnerPage() {
  const perHour = sharePerHourEur();
  const monthly = monthlyFromClientEur(320);

  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Sales-partner · ZZP op commissie</p>
          <h1 className="mt-4 font-display text-4xl font-bold md:text-6xl">Verdien mee met ZekerFlex</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">
            Breng bedrijven binnen die flexkrachten nodig hebben. Je verdient een aanbrengbonus én doorlopende commissie
            over elk gewerkt uur — een jaar lang. Geen vaste uren, geen target, en je wordt <strong>alleen</strong> uit
            fee betaald die ZekerFlex écht heeft verdiend.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#aanmelden" className="btn-mint">Meld je aan</a>
            <a href="#hoe" className="btn-ghost-invert">Hoe het werkt</a>
          </div>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Het model" title="Je verdient uit resultaat — en het stapelt op" intro="Eerlijk en risicoloos voor jou én voor ZekerFlex: er wordt pas uitbetaald als er echt gewerkt (en dus verdiend) is." />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={euro0(SALES_PARTNER.activationBonusEur)} label="Aanbrengbonus per klant, bij diens eerste voltooide klus" />
          <Stat value={`${SALES_PARTNER.revenueSharePct}%`} label={`van de ${euro2(PLATFORM_FEE_PER_HOUR_EUR)}/uur fee = ${euro2(perHour)}/uur, ${SALES_PARTNER.revenueShareMonths} mnd lang`} />
          <Stat value={euro0(SALES_PARTNER.freelancerBonusEur)} label="Per aangebrachte freelancer die zijn eerste klus voltooit" />
          <Stat value="€0" label="Instapkosten, targets of vaste uren — je werkt als zzp'er" />
        </div>
        <p className="mt-8 max-w-2xl text-sm text-neutralx-600">
          Rekenvoorbeeld: één actieve klant die twee mensen 40 uur per week laat werken is ~320 uur per maand.
          Dat is <strong>~{euro0(monthly)} per maand</strong> uit die ene klant, een jaar lang — en meerdere klanten
          tellen op. Top-partners (vanaf {SALES_PARTNER.tierClients} actieve klanten) gaan naar {SALES_PARTNER.tierRevenueSharePct}% op nieuwe klanten.
        </p>
      </Section>

      <Section id="hoe">
        <SectionHead eyebrow="Zo werkt het" title="In drie stappen naar doorlopende inkomsten" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.title} className="rounded-2xl border border-hair bg-white p-6">
              <h3 className="font-display text-lg font-bold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm text-neutralx-600">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Waarom dit werkt" title="Aantrekkelijk én houdbaar" />
        <div className="mt-8 grid gap-6 sm:grid-cols-3 text-sm text-neutralx-700">
          <div><p className="font-semibold text-ink">Terugkerend & uncapped</p><p className="mt-1">Eén keer binnenhalen, een jaar lang verdienen. Hoe actiever je klant, hoe meer jij verdient.</p></div>
          <div><p className="font-semibold text-ink">Geen risico, geen baas</p><p className="mt-1">Je werkt als zzp&apos;er, bepaalt je eigen uren en tempo. Geen target, geen boete, geen kosten.</p></div>
          <div><p className="font-semibold text-ink">Betaald uit echt geld</p><p className="mt-1">Commissie komt uit fee die ZekerFlex daadwerkelijk heeft geïncasseerd — dus altijd te vertrouwen en op tijd.</p></div>
        </div>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Aanmelden" title="Begin als sales-partner" intro="Vul het in — we helpen je op weg met pitch, demo en onboarding voor je eerste klanten." />
        <div className="mt-8 max-w-3xl">
          <SalesPartnerForm />
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Goed om te weten" />
        <div className="mt-8"><FaqList items={SALES_PARTNER_FAQ} /></div>
      </Section>

      <CtaBand
        title="Klaar om mee te verdienen?"
        body="Meld je aan als sales-partner, of bekijk eerst hoe ZekerFlex werkt voor de bedrijven die je binnenhaalt."
        primaryHref="#aanmelden"
        primaryLabel="Aanmelden"
        secondaryHref="/voor-bedrijven"
        secondaryLabel="Hoe het werkt voor bedrijven"
      />
    </>
  );
}
