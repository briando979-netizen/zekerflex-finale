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
import { gegevensMist } from "@/lib/onboarding/gegevens-mist";
import { GegevensMist } from "@/components/app/GegevensMist";
import { BackLink } from "@/components/app/BackLink";
import { stripeIdentityAvailable, syncStripeIdentity } from "@/lib/kyc/stripe-identity";
import { getLocale, getFreelancerDict } from "@/lib/i18n/server";
import Link from "next/link";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import { attemptLabel, waitForStripe } from "@/lib/kyc/stripe-status";
import { StripeIdentityWacht } from "@/components/app/StripeIdentityWacht";
import { WerkrechtPanel } from "@/components/app/WerkrechtPanel";
import { werkrechtVoorWerk, werkrechtEisAan } from "@/lib/werkrecht/store";
import { leesWieBenJij } from "@/lib/onboarding/wie-ben-jij-opslag";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { openVerplicht, volgendeNaVerificatie } from "@/lib/onboarding/werker-poort";
import { nogStappenTekst } from "@/lib/onboarding/laat-weten";
import { beginStap } from "@/lib/onboarding/wie-ben-jij";
import { isReservedTestAddress } from "@/lib/mail";
import { featureEnabled } from "@/lib/flags";
import { vulIn } from "@/lib/i18n/vul-in";

export const dynamic = "force-dynamic";

export default async function VerificatiePage() {
  const principal = await requirePrincipal();
  const pt = AUTH_DICTS[await getLocale()].page;
  const fd = await getFreelancerDict();
  const klaar = fd.profielAf.klaar;
  const vt = fd.verificatie;
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
    const volgende = volgendeNaVerificatie(poortNu);
    return (
      <div className="mx-auto max-w-2xl">
        <BackLink fallbackHref="/dashboard/account" label={pt.back} />
        <PageHeader title={pt.doneTitle} subtitle={pt.doneSub} />
        {volgende === "foto" && (
          <div className="mb-6 card p-5">
            <p className="text-sm font-semibold text-ink">{fd.start.fotoStep}</p>
            <p className="mt-1 text-sm text-neutralx-600">{fd.start.fotoBody}</p>
            <Link href="/dashboard/eerste-indruk?stap=foto" className="btn-primary mt-4 inline-flex">{fd.start.fotoCta}</Link>
          </div>
        )}
        <Panel title={vt.status}>
          <div className="px-5 py-6">
            {volgende !== "klaar" && poortNu ? (
              <StatusPill tone="warn">{nogStappenTekst(openVerplicht(poortNu), fd.start, fd.intl)}</StatusPill>
            ) : werkrecht.ok ? (
              <StatusPill tone="ok">{vt.geverifieerd}</StatusPill>
            ) : (
              <StatusPill tone="warn">{pt.werkrecht.nodig}</StatusPill>
            )}
            <ul className="mt-4 space-y-2">
              {o.onboarding.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5 text-sm">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-ok text-[10px] text-white">✓</span>
                  {/* de label komt uit lib/dashboard/freelancer.ts (Nederlands, ook elders gelezen); hier vertaald op het id */}
                  <span className="text-neutralx-600">{Object.hasOwn(vt.stappen, s.id) ? vt.stappen[s.id as keyof typeof vt.stappen] : s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

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

        <div className="mt-6">
          <Panel title={vt.verplichteDocumenten}>
            <div className="p-5">
              <ComplianceDocsPanel />
            </div>
          </Panel>
        </div>

        {fiscal.workerKind === "uitzendkracht" && (
          <div className="mt-6">
            <Panel title={vt.uitzenden}>
              <div className="p-5">
                <UitzendPanel />
              </div>
            </Panel>
          </div>
        )}
      </div>
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
  const woonKlaar =
    Boolean(bewaard?.homePostalCode) &&
    (isUitzend || Boolean(bewaard?.kvkNumber && /^\d+$/.test(bewaard.kvkNumber)) || Boolean(bewaard?.vatNumber));
  const begin = beginStap({ persoonKlaar: persoon.klaar, woonKlaar, idKlaar });
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
  const initial = {
    ...(bewaard?.kvkNumber && /^\d+$/.test(bewaard.kvkNumber) ? { kvkNumber: bewaard.kvkNumber } : {}),
    ...(bewaard?.vatNumber ? { vatNumber: bewaard.vatNumber } : {}),
    ...(bewaard?.homePostalCode ? { postalCode: bewaard.homePostalCode } : {}),
  };

  const reasons =
    lastCheck && typeof lastCheck.rawPayload === "object" && lastCheck.rawPayload !== null
      ? ((lastCheck.rawPayload as Record<string, unknown>).ai as { reasons?: string[] } | undefined)?.reasons ?? []
      : [];

  const stripeId = await stripeIdentityAvailable();
  // de knop "Digitale ID-wallet" alleen met de vlag: nieuwe Chrome (Android) toont hem, maar bijna niemand in Nederland heeft een ID in een wallet (lib/kyc/wallet.ts)
  const walletAan = !stripeId && (await featureEnabled("kyc-wallet").catch(() => false));
  const stripeReason =
    lastCheck?.decisionStatus === "requires_input"
      ? ((lastCheck.rawPayload as { reason?: string } | null)?.reason ?? vt.onbekendeReden)
      : null;

  return (
    <div className="mx-auto max-w-2xl">
      <GegevensMist mist={mist} soort={fiscal.workerKind ?? null} loonheffingskorting={fiscal.loonheffingskorting} />

      {lastCheck && (
        <div className="mb-6 card p-4 text-sm">
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
            <p className="mt-2 text-neutralx-600">
              {vulIn(vt.stripeAfgekeurd, { reden: stripeReason })}
            </p>
          )}
          {reasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-neutralx-600">
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <OnboardingForm
        defaultName={principal.fullName}
        requireKvk={!isUitzend}
        stripeIdentity={stripeId}
        initial={initial}
        persoon={persoon}
        beginStap={begin}
        idKlaar={idKlaar}
        kanSluiten={poort?.klaar ?? true}
      />

      {walletAan && (
        <div className="mt-4">
          <WalletVerifyButton requireKvk={!isUitzend} />
        </div>
      )}

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

      {fiscal.workerKind === "uitzendkracht" && (
        <div id="uitzendovereenkomst" tabIndex={-1} className="mt-6 card scroll-mt-20 p-6 focus:outline-none">
          <h2 className="font-display text-base font-bold text-ink">{vt.uitzenden}</h2>
          <div className="mt-4">
            <UitzendPanel />
          </div>
        </div>
      )}
    </div>
  );
}
