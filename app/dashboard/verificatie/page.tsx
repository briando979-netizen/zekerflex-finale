import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { PageHeader, Panel, StatusPill } from "@/components/app/ui";
import { OnboardingOnderhoudBalk } from "@/components/app/OnboardingOnderhoudBalk";
import { OnboardingForm } from "@/components/app/OnboardingForm";
import { WalletVerifyButton } from "@/components/app/WalletVerifyButton";
import { ComplianceDocsPanel } from "@/components/app/ComplianceDocsPanel";
import { UitzendPanel } from "@/components/app/UitzendPanel";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { BackLink } from "@/components/app/BackLink";
import { stripeIdentityAvailable, syncStripeIdentity } from "@/lib/kyc/stripe-identity";
import { getLocale, getFreelancerDict } from "@/lib/i18n/server";
import Link from "next/link";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import { attemptLabel, waitForStripe } from "@/lib/kyc/stripe-status";
import { StripeIdentityWacht } from "@/components/app/StripeIdentityWacht";
import { WerkrechtPanel } from "@/components/app/WerkrechtPanel";
import { werkrechtVoorWerk } from "@/lib/werkrecht/store";

export const dynamic = "force-dynamic";

export default async function VerificatiePage() {
  const principal = await requirePrincipal();
  const pt = AUTH_DICTS[await getLocale()].page;
  const klaar = (await getFreelancerDict()).profielAf.klaar;
  // back from Stripe (or webhook not configured): fetch the result before rendering
  await syncStripeIdentity(principal.userId);
  const [o, lastCheck, fiscal, werkrecht] = await Promise.all([
    getFreelancerOverview(principal.userId),
    prisma.identityVerification.findFirst({
      where: { userId: principal.userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, decisionStatus: true, createdAt: true, rawPayload: true },
    }),
    getFiscal(principal.userId),
    werkrechtVoorWerk(principal.userId, "NL"),
  ]);

  if (o.profileComplete) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackLink fallbackHref="/dashboard/account" label={pt.back} />
        <PageHeader title={pt.doneTitle} subtitle={pt.doneSub} />
        <Panel title="Status">
          <div className="px-5 py-6">
            {werkrecht.ok ? (
              <StatusPill tone="ok">Geverifieerd — je kunt diensten aannemen</StatusPill>
            ) : (
              <StatusPill tone="warn">{pt.werkrecht.nodig}</StatusPill>
            )}
            <ul className="mt-4 space-y-2">
              {o.onboarding.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5 text-sm">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-ok text-[10px] text-white">✓</span>
                  <span className="text-neutralx-600">{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <div id="werkrecht" className="mt-6 scroll-mt-20">
          <Panel title={pt.werkrecht.title}>
            <div className="p-5">
              <WerkrechtPanel />
            </div>
          </Panel>
        </div>

        <div className="mt-6">
          <Panel title={klaar.nextTitle}>
            <div className="px-5 py-5">
              <p className="text-sm font-semibold text-ink">{klaar.title}</p>
              <p className="mt-1 text-sm text-neutralx-600">{klaar.sub}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/dashboard/klussen" className="btn-primary">{klaar.jobs}</Link>
                <Link href="/dashboard/profiel" className="btn-ghost">{klaar.profile}</Link>
                <Link href="/dashboard/beschikbaarheid" className="btn-ghost">{klaar.availability}</Link>
                {!o.stappen.find((st) => st.key === "push")?.done && (
                  <Link href="/dashboard/account" className="btn-ghost">{klaar.push}</Link>
                )}
              </div>
            </div>
          </Panel>
        </div>

        <div className="mt-6">
          <Panel title="Verplichte documenten">
            <div className="p-5">
              <ComplianceDocsPanel />
            </div>
          </Panel>
        </div>

        {fiscal.workerKind === "uitzendkracht" && (
          <div className="mt-6">
            <Panel title="Uitzenden — verloning, StiPP & loonheffing">
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

  const reasons =
    lastCheck && typeof lastCheck.rawPayload === "object" && lastCheck.rawPayload !== null
      ? ((lastCheck.rawPayload as Record<string, unknown>).ai as { reasons?: string[] } | undefined)?.reasons ?? []
      : [];

  const stripeId = await stripeIdentityAvailable();
  const stripeReason =
    lastCheck?.decisionStatus === "requires_input"
      ? ((lastCheck.rawPayload as { reason?: string } | null)?.reason ?? "onbekende reden")
      : null;

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink fallbackHref="/dashboard/account" label={pt.back} />
      <OnboardingOnderhoudBalk soort="werker" />
      <PageHeader
        title={pt.title}
        subtitle={
          isUitzend
            ? pt.subUitzend
            : pt.subWorker
        }
      />

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
              Stripe kon je ID niet goedkeuren ({stripeReason}). Probeer het opnieuw met goed licht, of kies &ldquo;Zelf foto&apos;s uploaden&rdquo;.
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

      <div className="card trust-card relative overflow-hidden p-6">
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-trust via-[#A78BFA] to-trust" aria-hidden />
        <OnboardingForm defaultName={principal.fullName} requireKvk={!isUitzend} stripeIdentity={stripeId} />
      </div>

      {!stripeId && (
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

      <div id="werkrecht" className="mt-6 card scroll-mt-20 p-6">
        <h2 className="font-display text-base font-bold text-ink">{pt.werkrecht.title}</h2>
        <div className="mt-3">
          <WerkrechtPanel />
        </div>
      </div>

      {fiscal.workerKind === "uitzendkracht" && (
        <div className="mt-6 card p-6">
          <h2 className="font-display text-base font-bold text-ink">Uitzenden — verloning, StiPP & loonheffing</h2>
          <div className="mt-4">
            <UitzendPanel />
          </div>
        </div>
      )}
    </div>
  );
}
