import { requirePrincipal } from "@/lib/auth";
import { getFiscal } from "@/lib/fiscal/store";
import { payslipsForUser } from "@/lib/payroll/store";
import { euro } from "@/lib/payroll/format";
import { PageHeader, Panel, KpiCard } from "@/components/app/ui";
import { PayslipList } from "@/components/app/PayslipList";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VerloningPage() {
  const principal = await requirePrincipal();
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
      <PageHeader
        title="Verloning"
        subtitle={
          isPayroll
            ? "Je wekelijkse loonstrook: uren, brutoloon, inhoudingen, reserveringen en je ABU-fase."
            : "Je wekelijkse factuuroverzicht: dienstbedragen, btw en uitbetalingen."
        }
      />

      {!fiscal.completedAt && (
        <div className="mb-6 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-ink-soft">
          Je werkvorm- en fiscale gegevens zijn nog niet compleet.{" "}
          <Link href="/dashboard/fiscaal" className="font-semibold text-brand-600 underline">
            Vul ze aan
          </Link>{" "}
          zodat je verloning klopt.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={latest ? `Laatste week (${latest.weekLabel.split("·")[0]?.trim()})` : "Laatste week"}
          value={latest ? euro(latest.computed.headlineCents) : "—"}
          tone="brand"
          {...(latest ? { hint: latest.computed.headlineLabel } : {})}
        />
        <KpiCard label={`Bruto ${new Date().getUTCFullYear()}`} value={euro(ytdGross)} />
        {isPayroll ? (
          <KpiCard label="Reservering vakantie (dit jaar)" value={euro(holidayReserve)} hint="vakantiegeld + vakantie-uren" />
        ) : (
          <KpiCard label="Weken verloond" value={String(payslips.length)} />
        )}
      </div>

      {isPayroll && latest?.computed.breakdown.kind === "payroll" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <KpiCard label="ABU-fase" value={latest.computed.breakdown.phase} hint={`${latest.weeksWorked} weken opgebouwd`} />
          <KpiCard
            label="Pensioenregeling"
            value={
              latest.computed.breakdown.pensionRegeling === "geen"
                ? "Nog niet"
                : `StiPP ${latest.computed.breakdown.pensionRegeling}`
            }
          />
          <KpiCard label="Loonheffingskorting" value={fiscal.loonheffingskorting ? "Toegepast" : "Niet toegepast"} />
        </div>
      )}

      <div className="mt-8">
        <Panel title="Overzicht per week">
          <div className="p-4">
            <PayslipList payslips={payslips} />
          </div>
        </Panel>
      </div>
    </>
  );
}
