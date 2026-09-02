import { redirect } from "next/navigation";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { isEmployerOnboarded } from "@/lib/onboarding/employer";
import { getOrgProfileExtra, type OrgProfileExtra } from "@/lib/profile/store";
import { prisma } from "@/lib/prisma";
import { EmployerOnboardingWizard } from "@/components/app/EmployerOnboardingWizard";

export const dynamic = "force-dynamic";

export default async function WerkgeverOnboardingPage() {
  const principal = await requirePrincipal();
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) redirect("/werkgever");

  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const [kvkDone, extra, orgName] = await Promise.all([
    isEmployerOnboarded(scope.tenantIds),
    tenantId ? getOrgProfileExtra(tenantId) : Promise.resolve({} as OrgProfileExtra),
    tenantId
      ? prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }).then((t) => t?.name ?? "je organisatie")
      : Promise.resolve("je organisatie"),
  ]);

  const ob = extra.onboarding ?? {};
  const answers: Record<string, string> = {};
  for (const k of ["role", "sector", "shortageFrequency", "urgency", "priorPlatform"] as const) {
    if (ob[k]) answers[k] = ob[k]!;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">Welkom bij ZekerFlex</h1>
      <p className="mt-1 text-sm text-neutralx-600">
        Voltooi de onderstaande stappen voor een vlotte start met {orgName}.
      </p>
      <div className="mt-8">
        <EmployerOnboardingWizard
          initial={{
            kvkDone,
            profileStepDone: Boolean(ob.profileStepDone),
            emailVerified: Boolean(principal.emailVerifiedAt),
            answers,
          }}
        />
      </div>
    </div>
  );
}
