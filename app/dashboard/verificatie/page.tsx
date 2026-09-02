import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { PageHeader, Panel, StatusPill } from "@/components/app/ui";
import { OnboardingForm } from "@/components/app/OnboardingForm";
import { ComplianceDocsPanel } from "@/components/app/ComplianceDocsPanel";
import { UitzendPanel } from "@/components/app/UitzendPanel";
import { getFiscal } from "@/lib/fiscal/store";

export const dynamic = "force-dynamic";

export default async function VerificatiePage() {
  const principal = await requirePrincipal();
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
        <PageHeader title="Verificatie" subtitle="Je account is volledig geverifieerd." />
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

  const reasons =
    lastCheck && typeof lastCheck.rawPayload === "object" && lastCheck.rawPayload !== null
      ? ((lastCheck.rawPayload as Record<string, unknown>).ai as { reasons?: string[] } | undefined)?.reasons ?? []
      : [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Rond je verificatie af"
        subtitle="Koppel je KVK en upload je identiteitsbewijs. De ingebouwde controleur checkt echtheid en consistentie — meestal binnen een minuut."
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
              {lastCheck.decisionStatus === "in_review" ? "In behandeling" : lastCheck.status}
            </StatusPill>
          </div>
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
        <OnboardingForm defaultName={principal.fullName} />
      </div>

      <div className="mt-6 card p-6">
        <h2 className="font-display text-base font-bold text-ink">Verplichte documenten</h2>
        <p className="mt-1 text-sm text-neutralx-500">
          Nodig voordat je uitbetaald kunt worden — je IBAN wordt hiermee gecontroleerd.
        </p>
        <div className="mt-4">
          <ComplianceDocsPanel />
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
