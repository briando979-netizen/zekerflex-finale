import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { PageHeader, Panel, StatusPill } from "@/components/app/ui";
import { OnboardingForm } from "@/components/app/OnboardingForm";
import { WalletVerifyButton } from "@/components/app/WalletVerifyButton";
import { ComplianceDocsPanel } from "@/components/app/ComplianceDocsPanel";
import { UitzendPanel } from "@/components/app/UitzendPanel";
import { getFiscal, invoiceModeFor, fiscaalIngevuld } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";
import { aanmeldingAf, gegevensMist, voorEersteKlus, type GegevensStand, type GegevensStuk } from "@/lib/onboarding/gegevens-mist";
import { GegevensMist, type BtwBegin } from "@/components/app/GegevensMist";
import { BackLink } from "@/components/app/BackLink";
import { stripeIdentityAvailable, syncStripeIdentity } from "@/lib/kyc/stripe-identity";
import { getLocale, getFreelancerDict } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { SCAN_EXTRA } from "@/lib/i18n/scan-extra";
import { verderKaart } from "@/lib/onboarding/verder-kaart";
import Link from "next/link";
import { AUTH_DICTS, fill, type AuthDict } from "@/lib/i18n/auth";
import { vertaalIdTekst } from "@/lib/i18n/id-redenen";
import type { FreelancerDict } from "@/lib/i18n/freelancer";
import { attemptLabel, waitForStripe } from "@/lib/kyc/stripe-status";
import { StripeIdentityWacht } from "@/components/app/StripeIdentityWacht";
import { WerkrechtPanel } from "@/components/app/WerkrechtPanel";
import { werkrechtEisAan } from "@/lib/werkrecht/store";
import { leesWieBenJij } from "@/lib/onboarding/wie-ben-jij-opslag";
import { werkerPoortStand, type WerkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { poortStapVan, volgendeNaVerificatie } from "@/lib/onboarding/werker-poort";
import { beginStap } from "@/lib/onboarding/wie-ben-jij";
import { nogVoorEersteKlusVan } from "@/lib/onboarding/klaar-voor-klus-server";
import type { KlusStuk } from "@/lib/onboarding/klaar-voor-klus";
import { featureEnabled } from "@/lib/flags";
import { LATER_ANKERS, laterBlokTonen, stapStaatElders } from "@/lib/onboarding/later-blok";
import { ZEKERFLEX_UITZENDER } from "@/lib/uitzend/model";

export const dynamic = "force-dynamic";

/**
 * Het eindscherm van de aanmelding: per onderdeel een vinkje of "nog open" (met de plek waar je het doet), wat er daarna
 * kan, de documenten met het rekeningnummer, en bij een uitzendkracht de verloning. Staat het rekeningnummer nog open,
 * dan staat dat direct onder de stand: het hoort niet bij de aanmelding, maar is wel nodig vóór je eerste klus
 * (lib/fiscal/eligibility.ts).
 */
function AanmeldingKlaar({
  pt,
  fd,
  poortNu,
  werkrechtVragen,
  uitzend,
  taal,
  nogVoorKlus,
  voorKlus = [],
  bsnVoorstel = null,
  soort = null,
  btw = null,
}: {
  taal: Locale;
  pt: AuthDict["page"];
  fd: FreelancerDict;
  poortNu: WerkerPoortStand | null;
  werkrechtVragen: boolean;
  uitzend: boolean;
  /** wat reageren nog tegenhoudt, dezelfde lijst als bovenaan Klussen (lib/onboarding/klaar-voor-klus.ts) */
  nogVoorKlus: KlusStuk[];
  /** wat er nog moet vóór de eerste klus (uitzendkracht: BSN, overeenkomst; zzp'er/flexwerker: btw/KVK/KOR; voorEersteKlus) */
  voorKlus?: GegevensStuk[];
  /** de laatste 4 van het BSN dat van het ID is gelezen, nog niet bevestigd */
  bsnVoorstel?: string | null;
  /** de werkvorm: bij een zzp'er of flexwerker staat het btw-veld in "Nog nodig vóór je eerste klus" */
  soort?: "zzp" | "flexwerker" | "uitzendkracht" | null;
  /** wat er al bekend is voor het btw-veld */
  btw?: BtwBegin | null;
}) {
  const klaar = fd.profielAf.klaar;
  const volgende = volgendeNaVerificatie(poortNu);
  // staat er nog een stap open (behalve de foto, die heeft zijn eigen kaart), zeg dan welke en geef een knop erheen
  // (14 nov 2026: 12 van de 19 werkers met een ID stonden stil bij de branches, en hier stond alleen "Nog 1 stap te gaan!")
  const verder = verderKaart(poortNu, fd.start, SCAN_EXTRA[taal].volgendeKnop);
  // de postcode is er (het formulier is af), dus een open rekeningnummer is het enige wat de bank nog vraagt
  const ibanOpen = nogVoorKlus.includes("iban");
  // "je bent klaar, je kunt reageren" alleen als dat ook zo is (15 nov: het stond er ook als het BSN, de overeenkomst of
  // het rekeningnummer nog ontbrak)
  const echtKlaar = volgende === "klaar" && nogVoorKlus.length === 0;
  const documenten = (
    <div id="bankrekening" className="mt-6 scroll-mt-20">
      <Panel title={ibanOpen ? pt.bankTitle : pt.documentenTitel}>
        <div className="p-5">
          {ibanOpen && <p className="mb-4 text-sm text-neutralx-600">{pt.bankSub}</p>}
          {/* geen losse ID-upload (alleen de ID-scan) en geen tweede bankwaarschuwing: het blok legt zichzelf uit */}
          <ComplianceDocsPanel idInForm />
        </div>
      </Panel>
    </div>
  );
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink fallbackHref="/dashboard/account" label={pt.back} />
      <PageHeader title={pt.doneTitle} subtitle={pt.doneSub} />
      {verder && (
        <div className="mb-6 card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{verder.teller}</p>
          <p className="mt-1 text-sm font-semibold text-ink">{verder.naam}</p>
          <p className="mt-1 text-sm text-neutralx-600">{verder.uitleg}</p>
          <Link href={verder.href} data-track={`verificatie-naar-${verder.sleutel}`} className="btn-primary mt-4 inline-flex">
            {verder.knop}
          </Link>
        </div>
      )}
      {volgende === "foto" && (
        <div className="mb-6 card p-5">
          <p className="text-sm font-semibold text-ink">{fd.start.fotoStep}</p>
          <p className="mt-1 text-sm text-neutralx-600">{fd.start.fotoBody}</p>
          <Link href="/dashboard/eerste-indruk?stap=foto" className="btn-primary mt-4 inline-flex">{fd.start.fotoCta}</Link>
        </div>
      )}
      {/* uitzendkracht: het BSN en de overeenkomst horen sinds 13 nov niet bij de aanmelding, maar zijn nodig vóór de eerste
          klus (reageren houdt ze tegen). Hier meteen te doen; de overeenkomst staat onderaan (#uitzendovereenkomst) */}
      <GegevensMist mist={voorKlus} later kopId="gegevens-later-kop" soort={soort ?? (uitzend ? "uitzendkracht" : null)} bsnVoorstel={bsnVoorstel} btw={btw} />
      {/* hier stond een oude checklist met een eigen teller (weg, 15 nov); de lijst van Ontdekken hoort hier ook niet: deze
          pagina ís de plek waar je het invult (eindtest 16 nov: twee blokken met bijna dezelfde titel onder elkaar) */}

      {ibanOpen && documenten}

      {werkrechtVragen && (
        <div id="werkrecht" className="mt-6 scroll-mt-20">
          <Panel title={pt.werkrecht.title}>
            <div className="p-5">
              <WerkrechtPanel />
            </div>
          </Panel>
        </div>
      )}

      {echtKlaar && (
      <div className="mt-6">
        <Panel title={klaar.nextTitle}>
          <div className="px-5 py-5">
            <p className="text-sm font-semibold text-ink">{klaar.title}</p>
            <p className="mt-1 text-sm text-neutralx-600">{klaar.sub}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard/klussen" className="btn-primary">{klaar.jobs}</Link>
              <Link href="/dashboard/profiel" className="btn-ghost">{klaar.profile}</Link>
              <Link href="/dashboard/beschikbaarheid" className="btn-ghost">{klaar.availability}</Link>
            </div>
          </div>
        </Panel>
      </div>
      )}

      {!ibanOpen && documenten}

      {/* de uitzendovereenkomst met ZekerFlex alleen als ZekerFlex zelf uitzender is (lib/uitzend/model.ts) */}
      {uitzend && ZEKERFLEX_UITZENDER && (
        <div id="uitzendovereenkomst" tabIndex={-1} className="mt-6 scroll-mt-20 focus:outline-none">
          <Panel title={pt.uitzendKlaarTitel}>
            <div className="p-5">
              <UitzendPanel />
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

export default async function VerificatiePage() {
  const principal = await requirePrincipal();
  const locale = await getLocale();
  const pt = AUTH_DICTS[locale].page;
  const fd = await getFreelancerDict();
  // back from Stripe (or webhook not configured): fetch the result before rendering
  await syncStripeIdentity(principal.userId);
  const [o, lastCheck, fiscal, werkrechtVragen] = await Promise.all([
    getFreelancerOverview(principal.userId),
    prisma.identityVerification.findFirst({
      where: { userId: principal.userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, decisionStatus: true, createdAt: true, rawPayload: true },
    }),
    getFiscal(principal.userId),
    werkrechtEisAan(),
  ]);

  if (o.profileComplete) {
    // Gegevens en ID zijn af, maar reageren vraagt ook de rest van de onboarding (de profielfoto, of branches bij een
    // oud account): dan niet "je kunt diensten aannemen", maar de volgende stap (lib/onboarding/werker-poort.ts).
    const [poortNu, nogVoorKlus] = await Promise.all([
      werkerPoortStand(principal.userId).catch(() => null),
      nogVoorEersteKlusVan(principal.userId).catch(() => []),
    ]);
    return (
      <AanmeldingKlaar taal={locale} pt={pt} fd={fd} poortNu={poortNu} nogVoorKlus={nogVoorKlus} werkrechtVragen={werkrechtVragen} uitzend={fiscal.workerKind === "uitzendkracht"} />
    );
  }

  const isUitzend = invoiceModeFor(fiscal) === "payroll";

  // eerder bewaarde gegevens (bewaar en ga later verder): iemand begint niet opnieuw. Het KVK-nummer
  // van een profiel zonder bedrijf is een plaatshouder ("pending-…", "vat-…") en blijft dus leeg.
  const bewaard = await prisma.freelancerProfile.findUnique({
    where: { userId: principal.userId },
    select: { kvkNumber: true, vatNumber: true, homePostalCode: true, kvkValid: true },
  });
  // stap 1 ("Hey! Wie ben jij?") en waar deze werker verdergaat; de poort mag niet gesloten worden
  const [persoon, poort, gebruiker] = await Promise.all([
    leesWieBenJij(principal.userId),
    werkerPoortStand(principal.userId).catch(() => null),
    prisma.user.findUnique({ where: { id: principal.userId }, select: { kycStatus: true } }),
  ]);
  const idKlaar = gebruiker?.kycStatus === "VERIFIED";
  // de eigen controle wacht op een medewerker (PENDING, in_review): dan geen nieuwe scan aanbieden. 17 nov 2026: 4 van de 19
  // werkers scanden binnen een paar minuten alles opnieuw, omdat het scherm "opnieuw" aanbood terwijl een mens al zou kijken.
  const inBehandeling = !idKlaar && lastCheck?.status === "PENDING" && lastCheck.decisionStatus === "in_review";
  // de postcode; het KVK- of btw-nummer is daar sinds 13 nov optioneel (vóór de eerste klus, lib/fiscal/eligibility.ts)
  const woonKlaar = Boolean(bewaard?.homePostalCode);
  const begin = beginStap({ persoonKlaar: persoon.klaar, woonKlaar, idKlaar });
  // alleen tonen wat open staat (13 nov, 86): zijn persoon, woon en ID af (bijv. geverifieerd, alleen de overeenkomst
  // nog), dan geen formulier "Waar woon je?" meer
  const formulierNodig = !(persoon.klaar && woonKlaar && idKlaar);
  // wat er nog mist voor "gegevens", per onderdeel (BSN, overeenkomst, btw/KOR, postcode): bovenaan, met de plek om het te doen.
  // Dezelfde regel als de poort; staat de poort op "ingevuld", dan geen lijst.
  const gegevensStand: GegevensStand = {
    soort: fiscal.workerKind ?? null,
    fiscaalIngevuld: fiscaalIngevuld(fiscal),
    contractGetekend: isUitzend ? Boolean(await activeUitzendContract(principal.userId).catch(() => true)) : true,
    bedrijfOk: Boolean(bewaard?.kvkValid || /^\d{8}$/.test(bewaard?.kvkNumber ?? "") || fiscal.vatValid || fiscal.korApplies),
    postcodeOk: Boolean(bewaard?.homePostalCode),
  };
  const mist = poort?.gegevensIngevuld === true ? [] : gegevensMist(gegevensStand);
  // vóór de eerste klus (13 nov, eigenaar), onder "Later" en op het eindscherm: een uitzendkracht het BSN en de overeenkomst,
  // een zzp'er of flexwerker btw, KVK of KOR (15 nov: dat stond er niet, terwijl reageren erop wacht)
  const voorKlus = voorEersteKlus(gegevensStand);
  const btwBegin: BtwBegin = {
    vatNumber: fiscal.vatNumber,
    vatRequested: fiscal.vatRequested,
    korApplies: fiscal.korApplies,
    // de KVK uit de fiscale gegevens, anders uit het profiel (8 cijfers): nodig voor "btw aangevraagd" bij een zzp'er
    kvkNumber: fiscal.kvkNumber ?? (bewaard?.kvkNumber && /^\d{8}$/.test(bewaard.kvkNumber) ? bewaard.kvkNumber : null),
  };
  // Het formulier heeft niets meer te vragen (persoon, thuisbasis, ID en gegevens af), maar het profiel is nog niet "compleet"
  // (meestal: het rekeningnummer): dan het eindscherm met wat er echt nog open staat, niet opnieuw het formulier. Anders gaf
  // "Opslaan" eindeloos "Bovenaan deze pagina zie je wat er nog mist", zonder lijst (13 nov, gemeld door de eigenaar).
  if (aanmeldingAf({ persoonKlaar: persoon.klaar, woonKlaar, idKlaar, mist })) {
    return (
      <AanmeldingKlaar
        taal={locale}
        pt={pt}
        fd={fd}
        poortNu={poort}
        werkrechtVragen={werkrechtVragen}
        uitzend={fiscal.workerKind === "uitzendkracht"}
        voorKlus={voorKlus}
        bsnVoorstel={fiscal.bsnVoorstelLast4 ?? null}
        soort={fiscal.workerKind ?? null}
        btw={btwBegin}
        nogVoorKlus={await nogVoorEersteKlusVan(principal.userId).catch(() => [])}
      />
    );
  }
  // het blok "Voor je eerste klus" pas als de vijf stappen af zijn (werkerOnboardingKlaar); tot dan één regel. Wie al
  // gewerkt heeft of iets gepland heeft (bijv. met een verlopen ID opnieuw in het formulier) houdt het blok wel: die moet
  // bij zijn rekeningnummer en overeenkomst kunnen, ook via de links uit mail (#uitzendovereenkomst, #bankrekening)
  const laterTonen = laterBlokTonen(poort) || o.shiftsCompleted > 0 || o.kpis.upcoming > 0;
  const initial = {
    ...(bewaard?.kvkNumber && /^\d+$/.test(bewaard.kvkNumber) ? { kvkNumber: bewaard.kvkNumber } : {}),
    ...(bewaard?.vatNumber ? { vatNumber: bewaard.vatNumber } : {}),
    ...(bewaard?.homePostalCode ? { postalCode: bewaard.homePostalCode } : {}),
  };

  const reasons =
    lastCheck && typeof lastCheck.rawPayload === "object" && lastCheck.rawPayload !== null
      ? (((lastCheck.rawPayload as Record<string, unknown>).ai as { reasons?: string[] } | undefined)?.reasons ?? []).map((r) => vertaalIdTekst(r, locale))
      : [];

  const stripeId = await stripeIdentityAvailable();
  // de knop "Digitale ID-wallet" alleen met de vlag: nieuwe Chrome (Android) toont hem, maar bijna niemand in Nederland heeft een ID in een wallet (lib/kyc/wallet.ts)
  const walletAan = !stripeId && (await featureEnabled("kyc-wallet").catch(() => false));
  const stripeReason =
    lastCheck?.decisionStatus === "requires_input"
      ? ((lastCheck.rawPayload as { reason?: string } | null)?.reason ?? pt.onbekendeReden)
      : null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* geen apart blok "Je thuisbasis invullen" meer boven het formulier: het formulier vraagt het zelf (15 nov) */}

      {formulierNodig && (
        <OnboardingForm
          defaultName={principal.fullName}
          requireKvk={!isUitzend}
          stripeIdentity={stripeId}
          initial={initial}
          persoon={persoon}
          beginStap={begin}
          idKlaar={idKlaar}
          inBehandeling={inBehandeling}
          tochOpnieuw={pt.attempt.tochOpnieuw}
          kanSluiten={poort?.klaar ?? true}
          bsnBekend={Boolean(fiscal.bsnHash)}
        // de eerste stap die na de ID-scan nog open staat (de ID zelf telt dan als ingestuurd)
        naId={poort ? poortStapVan({ ...poort, identiteitIngestuurd: true }) : null}
          // de vorige ID-poging hoort bij de ID-stap (stap 4), niet bovenaan de pagina
          laatstePoging={
            lastCheck ? (
              <div className="card p-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{pt.attempt.last}</span>
                  <StatusPill
                    tone={
                      lastCheck.status === "VERIFIED" ? "ok" : lastCheck.status === "REJECTED" ? "crit" : "warn"
                    }
                  >
                    {attemptLabel(pt.attempt, lastCheck.decisionStatus, lastCheck.status)}
                  </StatusPill>
                </div>
                {inBehandeling && <p className="mt-2 text-neutralx-600">{pt.attempt.wachtMens}</p>}
                {waitForStripe(lastCheck.decisionStatus) && <StripeIdentityWacht text={pt.attempt.checking} />}
                {stripeReason && (
                  <p className="mt-2 text-neutralx-600">{fill(pt.stripeAfgewezen, { reden: stripeReason })}</p>
                )}
                {reasons.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-neutralx-600">
                    {reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null
          }
        />
      )}

      {walletAan && (
        <div className="mt-4">
          <WalletVerifyButton requireKvk={!isUitzend} />
        </div>
      )}

      {/* wat pas nodig is voor de eerste uitbetaling, apart onder de stappen (13 nov 2026, voorstel d4): de bank, het
          werkrecht (vlag) en, als de overeenkomst al getekend is, de uitzendgegevens (StiPP, loonheffingskorting) */}
      <section aria-labelledby="later-kop" className="mt-10 border-t border-hair pt-6">
        {/* tijdens de vijf stappen alleen één regel dat dit daarna komt (20 nov 2026: het hele blok stond er al onder, te
            veel tegelijk). De ankers blijven bestaan: wie via een mail of knop op #bankrekening e.d. binnenkomt, landt op
            die regel en niet op een lege plek (lib/onboarding/later-blok.ts) */}
        {!laterTonen && LATER_ANKERS.map((anker) => <span key={anker} id={anker} className="block scroll-mt-20" />)}
        <h2 id="later-kop" className="font-display text-base font-bold text-ink">{pt.laterTitel}</h2>
        {!laterTonen ? (
          <p className="mt-1 text-sm text-neutralx-500">
            {fd.klaarVoorKlus.daarna}
            {stapStaatElders(poort) && (
              <>
                {" "}
                <Link href="/dashboard/klussen" className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 underline underline-offset-2">
                  {fd.klaarVoorKlus.daarnaKnop}
                </Link>
              </>
            )}
          </p>
        ) : (
        <>
        <p className="mt-1 text-sm text-neutralx-500">{pt.laterUitleg}</p>
        {/* uitzendkracht: BSN en overeenkomst vóór de eerste klus (13 nov); "Naar de overeenkomst" springt naar het blok hieronder */}
        {voorKlus.length > 0 && (
          <div className="mt-6">
            <GegevensMist mist={voorKlus} later kopId="gegevens-later-kop" soort={fiscal.workerKind ?? null} bsnVoorstel={fiscal.bsnVoorstelLast4 ?? null} btw={btwBegin} />
          </div>
        )}
        <div id="bankrekening" className="mt-6 card scroll-mt-20 p-6">
          <h2 className="font-display text-base font-bold text-ink">{pt.bankTitle}</h2>
          <p className="mt-1 text-sm text-neutralx-500">{pt.bankSub}</p>
          <div className="mt-4">
            <ComplianceDocsPanel idInForm />
          </div>
        </div>

        {werkrechtVragen && (
          <div id="werkrecht" className="mt-6 card scroll-mt-20 p-6">
            <h2 className="font-display text-base font-bold text-ink">{pt.werkrecht.title}</h2>
            <div className="mt-3">
              <WerkrechtPanel />
            </div>
          </div>
        )}

        {isUitzend && ZEKERFLEX_UITZENDER && (
          <div id="uitzendovereenkomst" tabIndex={-1} className="mt-6 card scroll-mt-20 p-6 focus:outline-none">
            <h2 className="font-display text-base font-bold text-ink">{pt.uitzendTitel}</h2>
            <div className="mt-4">
              <UitzendPanel />
            </div>
          </div>
        )}
        </>
        )}
      </section>
    </div>
  );
}
