import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFreelancerOverview, type FreelancerOverview } from "@/lib/dashboard/freelancer";
import { PageHeader, Panel, StatusPill } from "@/components/app/ui";
import { OnboardingForm } from "@/components/app/OnboardingForm";
import { WalletVerifyButton } from "@/components/app/WalletVerifyButton";
import { ComplianceDocsPanel } from "@/components/app/ComplianceDocsPanel";
import { UitzendPanel } from "@/components/app/UitzendPanel";
import { getFiscal, invoiceModeFor, fiscaalIngevuld } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";
import { aanmeldingAf, gegevensMist } from "@/lib/onboarding/gegevens-mist";
import { GegevensMist } from "@/components/app/GegevensMist";
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
import { werkrechtVoorWerk, werkrechtEisAan } from "@/lib/werkrecht/store";
import { leesWieBenJij } from "@/lib/onboarding/wie-ben-jij-opslag";
import { werkerPoortStand, type WerkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { openVerplicht, poortStapVan, volgendeNaVerificatie } from "@/lib/onboarding/werker-poort";
import { nogStappenTekst } from "@/lib/onboarding/laat-weten";
import { beginStap } from "@/lib/onboarding/wie-ben-jij";
import { isReservedTestAddress } from "@/lib/mail";
import { featureEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

type Onderdeel = FreelancerOverview["onboarding"][number]["id"];
/** Waar je een onderdeel dat nog open staat afmaakt (null: hier niet te doen of al gedaan). */
const WAAR: Record<Onderdeel, string | null> = {
  account: null,
  fiscaal: "/dashboard/fiscaal",
  kvk: "/dashboard/fiscaal",
  contract: "#uitzendovereenkomst",
  kyc: null,
  thuisbasis: "#bankrekening",
};

/**
 * Het eindscherm van de aanmelding: per onderdeel een vinkje of "nog open" (met de plek waar je het doet), wat er daarna
 * kan, de documenten met het rekeningnummer, en bij een uitzendkracht de verloning. Staat het rekeningnummer nog open,
 * dan staat dat direct onder de stand: het hoort niet bij de aanmelding, maar is wel nodig vóór je eerste klus
 * (lib/fiscal/eligibility.ts).
 */
function AanmeldingKlaar({
  pt,
  fd,
  o,
  poortNu,
  werkrechtOk,
  werkrechtVragen,
  uitzend,
  taal,
  ibanOpen = false,
}: {
  taal: Locale;
  pt: AuthDict["page"];
  fd: FreelancerDict;
  o: FreelancerOverview;
  poortNu: WerkerPoortStand | null;
  werkrechtOk: boolean;
  werkrechtVragen: boolean;
  uitzend: boolean;
  ibanOpen?: boolean;
}) {
  const klaar = fd.profielAf.klaar;
  const volgende = volgendeNaVerificatie(poortNu);
  // staat er nog een stap open (behalve de foto, die heeft zijn eigen kaart), zeg dan welke en geef een knop erheen
  // (14 nov 2026: 12 van de 19 werkers met een ID stonden stil bij de branches, en hier stond alleen "Nog 1 stap te gaan!")
  const verder = verderKaart(poortNu, fd.start, SCAN_EXTRA[taal].volgendeKnop);
  const open = o.onboarding.filter((s) => !s.done).length;
  const documenten = (
    <div id="bankrekening" className="mt-6 scroll-mt-20">
      <Panel title={ibanOpen ? pt.bankTitle : pt.documentenTitel}>
        <div className="p-5">
          {ibanOpen && <p className="mb-4 text-sm text-neutralx-600">{pt.bankSub}</p>}
          <ComplianceDocsPanel />
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
      <Panel title={pt.statusTitel}>
        <div className="px-5 py-6">
          {volgende !== "klaar" && poortNu ? (
            <StatusPill tone="warn">{nogStappenTekst(openVerplicht(poortNu), fd.start, fd.intl)}</StatusPill>
          ) : open > 0 ? (
            <StatusPill tone="warn">{nogStappenTekst(open, fd.start, fd.intl)}</StatusPill>
          ) : werkrechtOk ? (
            <StatusPill tone="ok">{pt.geverifieerdKlaar}</StatusPill>
          ) : (
            <StatusPill tone="warn">{pt.werkrecht.nodig}</StatusPill>
          )}
          <ul className="mt-4 space-y-2">
            {o.onboarding.map((s) => {
              const waar = s.done ? null : WAAR[s.id];
              // in de app-taal, net als op /dashboard/profiel (het label uit de overview is Nederlands)
              const label = fd.profiel.stappen[s.id] ?? s.label;
              return (
                <li key={s.id} className="flex items-center gap-2.5 text-sm">
                  {s.done ? (
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-ok text-[10px] text-white">✓</span>
                  ) : (
                    <span aria-hidden className="h-4 w-4 rounded-full border-2 border-warn" />
                  )}
                  {waar ? (
                    <a href={waar} className="font-medium text-ink underline underline-offset-2">{label}</a>
                  ) : (
                    <span className={s.done ? "text-neutralx-600" : "font-medium text-ink"}>{label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Panel>

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

      {!ibanOpen && documenten}

      {uitzend && (
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
  const [o, lastCheck, fiscal, werkrecht, werkrechtVragen] = await Promise.all([
    getFreelancerOverview(principal.userId),
    prisma.identityVerification.findFirst({
      where: { userId: principal.userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, decisionStatus: true, createdAt: true, rawPayload: true },
    }),
    getFiscal(principal.userId),
    werkrechtVoorWerk(principal.userId, "NL"),
    werkrechtEisAan(),
  ]);

  if (o.profileComplete) {
    // Gegevens en ID zijn af, maar reageren vraagt ook de rest van de onboarding (de profielfoto, of branches bij een
    // oud account): dan niet "je kunt diensten aannemen", maar de volgende stap (lib/onboarding/werker-poort.ts).
    const poortNu = isReservedTestAddress(principal.email) ? null : await werkerPoortStand(principal.userId).catch(() => null);
    return (
      <AanmeldingKlaar taal={locale} pt={pt} fd={fd} o={o} poortNu={poortNu} werkrechtOk={werkrecht.ok} werkrechtVragen={werkrechtVragen} uitzend={fiscal.workerKind === "uitzendkracht"} />
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
    isReservedTestAddress(principal.email) ? Promise.resolve(null) : werkerPoortStand(principal.userId).catch(() => null),
    prisma.user.findUnique({ where: { id: principal.userId }, select: { kycStatus: true } }),
  ]);
  const idKlaar = gebruiker?.kycStatus === "VERIFIED";
  // de postcode; het KVK- of btw-nummer is daar sinds 13 nov optioneel (vóór de eerste klus, lib/fiscal/eligibility.ts)
  const woonKlaar = Boolean(bewaard?.homePostalCode);
  const begin = beginStap({ persoonKlaar: persoon.klaar, woonKlaar, idKlaar });
  // alleen tonen wat open staat (13 nov, 86): zijn persoon, woon en ID af (bijv. geverifieerd, alleen de overeenkomst
  // nog), dan geen formulier "Waar woon je?" meer
  const formulierNodig = !(persoon.klaar && woonKlaar && idKlaar);
  // wat er nog mist voor "gegevens", per onderdeel (BSN, overeenkomst, btw/KOR, postcode): bovenaan, met de plek om het te doen.
  // Dezelfde regel als de poort; staat de poort op "ingevuld", dan geen lijst.
  const mist =
    poort?.gegevensIngevuld === true
      ? []
      : gegevensMist({
          soort: fiscal.workerKind ?? null,
          fiscaalIngevuld: fiscaalIngevuld(fiscal),
          contractGetekend: isUitzend ? Boolean(await activeUitzendContract(principal.userId).catch(() => true)) : true,
          bedrijfOk: Boolean(bewaard?.kvkValid || /^\d{8}$/.test(bewaard?.kvkNumber ?? "") || fiscal.vatValid || fiscal.korApplies),
          postcodeOk: Boolean(bewaard?.homePostalCode),
        });
  // Het formulier heeft niets meer te vragen (persoon, thuisbasis, ID en gegevens af), maar het profiel is nog niet "compleet"
  // (meestal: het rekeningnummer): dan het eindscherm met wat er echt nog open staat, niet opnieuw het formulier. Anders gaf
  // "Opslaan" eindeloos "Bovenaan deze pagina zie je wat er nog mist", zonder lijst (13 nov, gemeld door de eigenaar).
  if (aanmeldingAf({ persoonKlaar: persoon.klaar, woonKlaar, idKlaar, mist })) {
    return (
      <AanmeldingKlaar
        taal={locale}
        pt={pt}
        fd={fd}
        o={o}
        poortNu={poort}
        werkrechtOk={werkrecht.ok}
        werkrechtVragen={werkrechtVragen}
        uitzend={fiscal.workerKind === "uitzendkracht"}
        // de postcode is er (woonKlaar), dus een open "thuisbasis en rekeningnummer" is het rekeningnummer
        ibanOpen={o.onboarding.some((s) => s.id === "thuisbasis" && !s.done)}
      />
    );
  }
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
      <GegevensMist
        mist={mist}
        soort={fiscal.workerKind ?? null}
        bsnVoorstel={fiscal.bsnVoorstelLast4 ?? null}
        btw={{
          vatNumber: fiscal.vatNumber,
          vatRequested: fiscal.vatRequested,
          korApplies: fiscal.korApplies,
          // de KVK uit de fiscale gegevens, anders uit het profiel (8 cijfers): nodig voor "btw aangevraagd" bij een zzp'er
          kvkNumber: fiscal.kvkNumber ?? (bewaard?.kvkNumber && /^\d{8}$/.test(bewaard.kvkNumber) ? bewaard.kvkNumber : null),
        }}
      />

      {/* de uitzendovereenkomst hoort bij de gegevens (stap 3): zolang hij niet getekend is direct onder wat er mist, niet
          onderaan de pagina (13 nov 2026, voorstel d4; "Naar de overeenkomst" in GegevensMist springt hierheen) */}
      {isUitzend && mist.includes("contract") && (
        <div id="uitzendovereenkomst" tabIndex={-1} className="mb-6 card scroll-mt-20 p-6 focus:outline-none">
          <h2 className="font-display text-base font-bold text-ink">{pt.uitzendTitel}</h2>
          <div className="mt-4">
            <UitzendPanel />
          </div>
        </div>
      )}

      {formulierNodig && (
        <OnboardingForm
          defaultName={principal.fullName}
          requireKvk={!isUitzend}
          stripeIdentity={stripeId}
          initial={initial}
          persoon={persoon}
          beginStap={begin}
          idKlaar={idKlaar}
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
        <h2 id="later-kop" className="font-display text-base font-bold text-ink">{pt.laterTitel}</h2>
        <p className="mt-1 text-sm text-neutralx-500">{pt.laterUitleg}</p>
        <div className="mt-6 card p-6">
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

        {isUitzend && !mist.includes("contract") && (
          <div id="uitzendovereenkomst" tabIndex={-1} className="mt-6 card scroll-mt-20 p-6 focus:outline-none">
            <h2 className="font-display text-base font-bold text-ink">{pt.uitzendTitel}</h2>
            <div className="mt-4">
              <UitzendPanel />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
