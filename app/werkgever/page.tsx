import Link from "next/link";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope, getEmployerOverview } from "@/lib/dashboard/employer";
import { isEmployerOnboarded } from "@/lib/onboarding/employer";
import { getOrgProfileExtra, type OrgProfileExtra } from "@/lib/profile/store";
import { recentThreads } from "@/lib/messaging/recent";
import {
  PageHeader,
  KpiCard,
  Panel,
  EmptyState,
  StatusPill,
  money,
  moneyExact,
  dateTime,
} from "@/components/app/ui";
import { EmployerShiftCard } from "@/components/app/EmployerShiftCard";
import { RecentMessagesPanel } from "@/components/app/RecentMessagesPanel";
import { EmployerOnboardingWizard } from "@/components/app/EmployerOnboardingWizard";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function WerkgeverStartPage() {
  const t = await getDict();
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  const [kvkDone, extra, o, threads] = await Promise.all([
    isEmployerOnboarded(scope.tenantIds),
    tenantId ? getOrgProfileExtra(tenantId) : Promise.resolve({} as OrgProfileExtra),
    getEmployerOverview(principal),
    recentThreads(principal.userId, false, 4),
  ]);

  const ob = extra.onboarding ?? {};
  const answers: Record<string, string> = {};
  for (const k of ["role", "sector", "shortageFrequency", "urgency", "priorPlatform"] as const) {
    if (ob[k]) answers[k] = ob[k]!;
  }
  const orgAnswered = Boolean(answers.role || answers.sector);
  const emailVerified = Boolean(principal.emailVerifiedAt);
  const wizardComplete = kvkDone && Boolean(ob.profileStepDone) && emailVerified && orgAnswered;
  const canOnboard = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  const showWizard = canOnboard && !wizardComplete;

  return (
    <>
      {showWizard ? (
        <section className="mb-12">
          <p className="eyebrow mb-2">{t.start.eyebrow}</p>
          <h1 className="font-display text-[1.9rem] font-bold uppercase leading-tight tracking-tight text-ink">
            {t.start.welcomeTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutralx-600">
            {fmt(t.start.welcomeBody, { org: o.orgName })}
          </p>
          <div className="mt-8">
            <EmployerOnboardingWizard
              initial={{
                kvkDone,
                profileStepDone: Boolean(ob.profileStepDone),
                emailVerified,
                answers,
                coverStepDone: Boolean(ob.coverStepDone),
              }}
            />
          </div>
        </section>
      ) : (
        <PageHeader
          title={o.orgName}
          eyebrow={t.start.eyebrow}
          subtitle={t.start.dashSubtitle}
          action={
            <Link href="/werkgever/diensten/nieuw" className="btn-primary">
              {t.start.placeShift}
            </Link>
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t.start.kpiOpen} value={String(o.kpis.openShifts)} tone={o.kpis.openShifts > 0 ? "warn" : "default"} />
        <KpiCard
          label={t.start.kpiToApprove}
          value={String(o.kpis.toApprove)}
          tone={o.kpis.toApprove > 0 ? "warn" : "default"}
          hint={t.start.kpiToApproveHint}
        />
        <KpiCard label={t.start.kpiSpent} value={money(o.kpis.spentThisMonthCents)} tone="brand" />
        <KpiCard label={t.start.kpiActive} value={String(o.kpis.activeFreelancers)} hint={t.start.kpiActiveHint} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title={t.start.upcomingTitle}
          action={
            <Link href="/werkgever/diensten" className="text-xs font-medium text-brand-600">
              {t.common.all}
            </Link>
          }
        >
          {o.shifts.length === 0 ? (
            <EmptyState
              title={t.start.upcomingEmptyTitle}
              body={t.start.upcomingEmptyBody}
            />
          ) : (
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {o.shifts.slice(0, 4).map((s) => (
                <EmployerShiftCard key={s.id} shift={s} href={`/werkgever/diensten/${s.id}`} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={t.start.approvalsTitle}
          action={
            <Link href="/werkgever/uren" className="text-xs font-medium text-brand-600">
              {t.common.all}
            </Link>
          }
        >
          {o.approvals.length === 0 ? (
            <EmptyState title={t.start.approvalsEmptyTitle} body={t.start.approvalsEmptyBody} />
          ) : (
            <ul className="divide-y divide-hair">
              {o.approvals.map((ap) => (
                <li key={ap.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{ap.freelancer}</p>
                    <p className="text-xs text-neutralx-500">
                      {ap.branch} · {dateTime(ap.scheduledStart)} · {(ap.billableMinutes / 60).toFixed(1)} u
                    </p>
                  </div>
                  <span className="num flex-shrink-0 font-mono text-sm text-ink">
                    {moneyExact(Math.round((ap.billableMinutes / 60) * ap.hourlyRateCents))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {threads.length > 0 && (
        <div className="mt-6">
          <Panel
            title={t.start.messagesTitle}
            action={
              <Link href="/werkgever/berichten" className="text-xs font-medium text-brand-600">
                {t.common.all}
              </Link>
            }
          >
            <RecentMessagesPanel threads={threads} allHref="/werkgever/berichten" />
          </Panel>
        </div>
      )}

      <div className="mt-6">
        <Panel
          title={t.start.invoicesTitle}
          action={
            <Link href="/werkgever/facturen" className="text-xs font-medium text-brand-600">
              {t.common.all}
            </Link>
          }
        >
          {o.invoices.length === 0 ? (
            <EmptyState title={t.start.invoicesEmptyTitle} body={t.start.invoicesEmptyBody} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">{t.start.invNr}</th>
                  <th className="px-5 py-2.5 font-medium">{t.start.invType}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.start.invAmount}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.start.invStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {o.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{i.number}</td>
                    <td className="px-5 py-3 text-neutralx-600">
                      {i.type === "PLATFORM_FEE" ? t.start.invFee : t.start.invShift}
                    </td>
                    <td className="num px-5 py-3 text-right font-medium">{moneyExact(i.totalCents)}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusPill tone={i.status === "PAID" ? "ok" : i.status === "ISSUED" ? "warn" : "neutral"}>
                        {i.status === "PAID" ? t.start.statusPaid : i.status === "ISSUED" ? t.start.statusOpen : i.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
