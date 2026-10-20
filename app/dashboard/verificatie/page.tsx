import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { PageHeader, Panel, StatusPill } from "@/components/app/ui";
import { OnboardingForm } from "@/components/app/OnboardingForm";
import { WalletVerifyButton } from "@/components/app/WalletVerifyButton";
import { ComplianceDocsPanel } from "@/components/app/ComplianceDocsPanel";
import { UitzendPanel } from "@/components/app/UitzendPanel";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { BackLink } from "@/components/app/BackLink";
import { stripeIdentityAvailable, syncStripeIdentity } from "@/lib/kyc/stripe-identity";
import { getLocale } from "@/lib/i18n/server";
import { AUTH_DICTS } from "@/lib/i18n/auth";

export const dynamic = "force-dynamic";

const STRIPE_LABEL: Record<string, string> = {
  started: "Bezig bij Stripe — de uitslag komt binnen een paar minuten",
  requires_input: "Niet gelukt bij Stripe",
  canceled: "Afgebroken",
  name_mismatch: "Naam wijkt af — wij controleren het handmatig",
  verified: "Geverifieerd",
};

export default async function VerificatiePage() {
  const principal = await requirePrincipal();
  const pt = AUTH_DICTS[await getLocale()].page;
  // back from Stripe (or webhook not configured): fetch the result before rendering
  await syncStripeIdentity(principal.userId);
  const [o, lastCheck, fiscal] = await Promise.all([
    getFreelancerOverview(principal.userId),
    prisma.identityVerification.findFirst({
      where: { userId: principal.userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, decisionStatus: true, createdAt: true, rawPayload: true },
    }),
    getFiscal(principal.userId),
  ]);

  if (o.profileComplete) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackLink fallbackHref="/dashboard/account" label={pt.back} />
        <PageHeader title={pt.doneTitle} subtitle={pt.doneSub} />
        <Panel title="Status">
          <div className="px-5 py-6">
            <StatusPill tone="ok">Geverifieerd — je kunt diensten aannemen</StatusPill>
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
            <span className="font-medium text-ink">Vorige poging:</span>
            <StatusPill
              tone={
                lastCheck.status === "VERIFIED" ? "ok" : lastCheck.status === "REJECTED" ? "crit" : "warn"
              }
            >
              {STRIPE_LABEL[lastCheck.decisionStatus ?? ""] ??
                (lastCheck.decisionStatus === "in_review" ? "In behandeling" : lastCheck.status)}
            </StatusPill>
          </div>
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

      <div className="card p-6">
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
