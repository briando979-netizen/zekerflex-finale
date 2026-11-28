import { getSiteT } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { Section, SectionHead, CtaBand, FaqList, Stat } from "@/components/marketing/primitives";
import { FotoKolom, HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { paginaFoto } from "@/lib/marketing/fotos";
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
import { robotsVerborgen } from "@/lib/seo/verbergen";

const title = "Word sales-partner — verdien mee op commissie";
const description =
  "Breng als zzp'er bedrijven binnen en verdien commissie: een aanbrengbonus plus commissie over elk gewerkt uur, een jaar lang. Geen vaste uren of target.";

const metaBasis: Metadata = {
  title,
  description,
  keywords: ["sales op commissie", "acquisitie zzp", "commissie sales baan", "partner worden", "bijverdienen sales"],
  ...canonical("/sales-partner", { title, description }),
};
// vlag `publiek-alleen-flexwerk`: uit Google en uit de voettekst als de vlag aan is; de pagina blijft bereikbaar via een directe link
export async function generateMetadata(): Promise<Metadata> {
  return { ...metaBasis, ...(await robotsVerborgen("/sales-partner")) };
}

const euro0 = (n: number) => `€ ${n.toFixed(0)}`;
const euro2 = (n: number) => `€ ${n.toFixed(2).replace(".", ",")}`;

export default async function SalesPartnerPage() {
  const tx = await getSiteT();
  const perHour = sharePerHourEur();
  const monthly = monthlyFromClientEur(320);

  return (
    <>
      <div className="hero-ink text-white">
      <div className="shell grid items-center gap-10 py-20 md:py-24 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="eyebrow text-brand-mint">{tx("Sales-partner · ZZP op commissie")}</p>
          <h1 className="mt-4 font-display text-4xl font-bold md:text-6xl">{tx("Verdien mee met ZekerFlex")}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">
            Breng bedrijven binnen die flexkrachten nodig hebben. Je verdient een aanbrengbonus én doorlopende commissie
            over elk gewerkt uur — een jaar lang. Geen vaste uren, geen target, en je wordt <strong>{tx("alleen")}</strong> uit
            fee betaald die ZekerFlex écht heeft verdiend.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#aanmelden" className="btn-mint">{tx("Meld je aan")}</a>
            <a href="#hoe" className="btn-ghost-invert">{tx("Hoe het werkt")}</a>
          </div>
        </div>
        <FotoKolom foto={paginaFoto("sales-partner")} />
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow={tx("Het model")} title={tx("Je verdient uit resultaat — en het stapelt op")} intro={tx("Eerlijk en risicoloos voor jou én voor ZekerFlex: er wordt pas uitbetaald als er echt gewerkt (en dus verdiend) is.")} />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={euro0(SALES_PARTNER.activationBonusEur)} label={tx("Aanbrengbonus per klant, bij diens eerste voltooide klus")} />
          <Stat value={`${SALES_PARTNER.revenueSharePct}%`} label={`van de ${euro2(PLATFORM_FEE_PER_HOUR_EUR)}/uur fee = ${euro2(perHour)}/uur, ${SALES_PARTNER.revenueShareMonths} mnd lang`} />
          <Stat value={euro0(SALES_PARTNER.freelancerBonusEur)} label={tx("Per aangebrachte freelancer die zijn eerste klus voltooit")} />
          <Stat value="€0" label={tx("Instapkosten, targets of vaste uren — je werkt als zzp'er")} />
        </div>
        <p className="mt-8 max-w-2xl text-sm text-neutralx-600">
          Rekenvoorbeeld: één actieve klant die twee mensen 40 uur per week laat werken is ~320 uur per maand.
          Dat is <strong>~{euro0(monthly)} per maand</strong> uit die ene klant, een jaar lang — en meerdere klanten
          tellen op. Top-partners (vanaf {SALES_PARTNER.tierClients} actieve klanten) gaan naar {SALES_PARTNER.tierRevenueSharePct}% op nieuwe klanten.
        </p>
      </Section>

      <Section id="hoe">
        <SectionHead eyebrow={tx("Zo werkt het")} title={tx("In drie stappen naar doorlopende inkomsten")} />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.title} className="rounded-2xl border border-hair bg-white p-6">
              <h3 className="font-display text-lg font-bold text-ink">{tx(s.title)}</h3>
              <p className="mt-2 text-sm text-neutralx-600">{tx(s.body)}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow={tx("Waarom dit werkt")} title={tx("Aantrekkelijk én houdbaar")} />
        <div className="mt-8 grid gap-6 sm:grid-cols-3 text-sm text-neutralx-700">
          <div><p className="font-semibold text-ink">{tx("Terugkerend & uncapped")}</p><p className="mt-1">{tx("Eén keer binnenhalen, een jaar lang verdienen. Hoe actiever je klant, hoe meer jij verdient.")}</p></div>
          <div><p className="font-semibold text-ink">{tx("Geen risico, geen baas")}</p><p className="mt-1">{tx("Je werkt als zzp'er, bepaalt je eigen uren en tempo. Geen target, geen boete, geen kosten.")}</p></div>
          <div><p className="font-semibold text-ink">{tx("Betaald uit echt geld")}</p><p className="mt-1">{tx("Commissie komt uit fee die ZekerFlex daadwerkelijk heeft geïncasseerd — dus altijd te vertrouwen en op tijd.")}</p></div>
        </div>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow={tx("Aanmelden")} title={tx("Begin als sales-partner")} intro={tx("Vul het in — we helpen je op weg met pitch, demo en onboarding voor je eerste klanten.")} />
        <div className="mt-8 max-w-3xl">
          <SalesPartnerForm />
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow={tx("Veelgestelde vragen")} title={tx("Goed om te weten")} />
        <div className="mt-8"><FaqList items={SALES_PARTNER_FAQ.map((f) => ({ q: tx(f.q), a: tx(f.a) }))} /></div>
      </Section>

      <CtaBand
        title={tx("Klaar om mee te verdienen?")}
        body={tx("Meld je aan als sales-partner, of bekijk eerst hoe ZekerFlex werkt voor de bedrijven die je binnenhaalt.")}
        primaryHref="#aanmelden"
        primaryLabel={tx("Aanmelden")}
        secondaryHref="/bedrijven"
        secondaryLabel={tx("Hoe het werkt voor bedrijven")}
      />
    </>
  );
}
