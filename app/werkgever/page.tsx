import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getEmployerOverview } from "@/lib/dashboard/employer";
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
import { recentThreads } from "@/lib/messaging/recent";

export const dynamic = "force-dynamic";

const SHIFT_TONE: Record<string, "ok" | "warn" | "crit" | "neutral"> = {
  FILLED: "ok",
  IN_PROGRESS: "ok",
  PARTIALLY_FILLED: "warn",
  OPEN: "warn",
  MATCHING: "warn",
  DRAFT: "neutral",
};

export default async function WerkgeverOverzichtPage() {
  const principal = await requirePrincipal();
  const [o, threads] = await Promise.all([
    getEmployerOverview(principal),
    recentThreads(principal.userId, false, 4),
  ]);

  return (
    <>
      <PageHeader
        title={o.orgName}
        subtitle="Bezetting, urengoedkeuring en facturatie in één overzicht."
        action={
          <Link href="/werkgever/diensten/nieuw" className="btn-primary">
            Dienst uitzetten
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open diensten" value={String(o.kpis.openShifts)} tone={o.kpis.openShifts > 0 ? "warn" : "default"} />
        <KpiCard
          label="Uren te keuren"
          value={String(o.kpis.toApprove)}
          tone={o.kpis.toApprove > 0 ? "warn" : "default"}
          hint="wacht op goedkeuring"
        />
        <KpiCard label="Uitgegeven deze maand" value={money(o.kpis.spentThisMonthCents)} tone="brand" />
        <KpiCard label="Actieve krachten" value={String(o.kpis.activeFreelancers)} hint="deze maand ingezet" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Aankomende diensten"
          action={
            <Link href="/werkgever/diensten" className="text-xs font-medium text-brand-600">
              Alles
            </Link>
          }
        >
          {o.shifts.length === 0 ? (
            <EmptyState
              title="Geen open diensten"
              body="Zet een dienst uit en ZekerFlex matcht direct de beste kandidaten."
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
          title="Uren te keuren"
          action={
            <Link href="/werkgever/uren" className="text-xs font-medium text-brand-600">
              Alles
            </Link>
          }
        >
          {o.approvals.length === 0 ? (
            <EmptyState title="Niets te doen" body="Alle ingediende uren zijn afgehandeld." />
          ) : (
            <ul className="divide-y divide-hair">
              {o.approvals.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{t.freelancer}</p>
                    <p className="text-xs text-neutralx-500">
                      {t.branch} · {dateTime(t.scheduledStart)} · {(t.billableMinutes / 60).toFixed(1)} u
                    </p>
                  </div>
                  <span className="num flex-shrink-0 font-mono text-sm text-ink">
                    {moneyExact(Math.round((t.billableMinutes / 60) * t.hourlyRateCents))}
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
            title="Berichten"
            action={
              <Link href="/werkgever/berichten" className="text-xs font-medium text-brand-600">
                Alles
              </Link>
            }
          >
            <RecentMessagesPanel threads={threads} allHref="/werkgever/berichten" />
          </Panel>
        </div>
      )}

      <div className="mt-6">
        <Panel
          title="Recente facturen"
          action={
            <Link href="/werkgever/facturen" className="text-xs font-medium text-brand-600">
              Alles
            </Link>
          }
        >
          {o.invoices.length === 0 ? (
            <EmptyState title="Nog geen facturen" body="Facturen worden automatisch aangemaakt na goedkeuring van uren." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">Nummer</th>
                  <th className="px-5 py-2.5 font-medium">Soort</th>
                  <th className="px-5 py-2.5 text-right font-medium">Bedrag</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {o.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{i.number}</td>
                    <td className="px-5 py-3 text-neutralx-600">
                      {i.type === "PLATFORM_FEE" ? "Platformfee" : "Dienst (zzp)"}
                    </td>
                    <td className="num px-5 py-3 text-right font-medium">{moneyExact(i.totalCents)}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusPill tone={i.status === "PAID" ? "ok" : i.status === "ISSUED" ? "warn" : "neutral"}>
                        {i.status === "PAID" ? "Betaald" : i.status === "ISSUED" ? "Open" : i.status}
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
