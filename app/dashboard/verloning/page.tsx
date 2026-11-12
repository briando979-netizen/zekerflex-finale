import { requirePrincipal } from "@/lib/auth";
import { getFiscal } from "@/lib/fiscal/store";
import { payslipsForUser } from "@/lib/payroll/store";
import { euro } from "@/lib/payroll/format";
import { loonstrookKop } from "@/lib/payroll/explain";
import { parseIsoWeekId } from "@/lib/payroll/week";
import { getFreelancerDict } from "@/lib/i18n/server";
import { vulIn } from "@/lib/i18n/vul-in";
import { PageHeader, Panel, KpiCard } from "@/components/app/ui";
import { PayslipList } from "@/components/app/PayslipList";
import { RebuildPayslipsButton } from "@/components/app/RebuildPayslipsButton";
import { BackLink } from "@/components/app/BackLink";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VerloningPage() {
  const principal = await requirePrincipal();
  const ft = await getFreelancerDict();
  const t = ft.loonstrook;
  const eur = (cents: number) => euro(cents, t.intl);
  const [payslips, fiscal] = await Promise.all([
    payslipsForUser(principal.userId),
    getFiscal(principal.userId),
  ]);

  const latest = payslips[0];
  const ytd = payslips.filter((p) => p.isoWeek.startsWith(String(new Date().getUTCFullYear())));
  const ytdGross = ytd.reduce(
    (s, p) =>
      s +
      (p.computed.breakdown.kind === "payroll"
        ? p.computed.breakdown.grossCents
        : p.computed.breakdown.servicesCents),
    0,
  );
  const holidayReserve = ytd.reduce(
    (s, p) =>
      s +
      (p.computed.breakdown.kind === "payroll"
        ? p.computed.breakdown.holidayAllowanceCents + p.computed.breakdown.holidayHoursReserveCents
        : 0),
    0,
  );

  const isPayroll = (fiscal.workerKind ?? "uitzendkracht") === "uitzendkracht";

  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <PageHeader
        title={t.titel}
        subtitle={isPayroll ? t.subPayroll : t.subFactuur}
      />

      {!fiscal.completedAt && (
        <div className="mb-6 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-ink-soft">
          {t.onvolledig}{" "}
          <Link href="/dashboard/fiscaal" className="font-semibold text-brand-600 underline">
            {t.vulAan}
          </Link>{" "}
          {t.zodat}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={
            latest
              ? vulIn(t.laatsteWeek, { week: vulIn(t.weekKort, { week: parseIsoWeekId(latest.isoWeek)?.week ?? latest.isoWeek }) })
              : t.laatsteWeekLeeg
          }
          value={latest ? eur(latest.computed.headlineCents) : "—"}
          tone="brand"
          {...(latest ? { hint: loonstrookKop(latest, t) } : {})}
        />
        <KpiCard label={vulIn(t.bruto, { jaar: new Date().getUTCFullYear() })} value={eur(ytdGross)} />
        {isPayroll ? (
          <KpiCard label={t.reservering} value={eur(holidayReserve)} hint={t.reserveringHint} />
        ) : (
          <KpiCard label={t.wekenVerloond} value={String(payslips.length)} />
        )}
      </div>

      {isPayroll && latest?.computed.breakdown.kind === "payroll" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <KpiCard label={t.abuFase} value={latest.computed.breakdown.phase} hint={vulIn(t.wekenOpgebouwd, { n: latest.weeksWorked })} />
          <KpiCard
            label={t.pensioenregeling}
            value={
              latest.computed.breakdown.pensionRegeling === "geen"
                ? t.nogNiet
                : vulIn(t.stipp, { regeling: t.regeling[latest.computed.breakdown.pensionRegeling] })
            }
          />
          <KpiCard label={t.lhk} value={fiscal.loonheffingskorting ? t.toegepast : t.nietToegepast} />
        </div>
      )}

      <div className="mt-8">
        <Panel
          title={t.overzicht}
          {...(isPayroll ? { action: <RebuildPayslipsButton /> } : {})}
        >
          <div className="p-4">
            <PayslipList payslips={payslips} t={t} />
          </div>
        </Panel>
      </div>
    </>
  );
}
