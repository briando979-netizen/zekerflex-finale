import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bucketSum, resolvePeriod, safe, timelineKeys } from "@/lib/admin/period";
import { PageHead, Panel } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { AdminBankView } from "@/components/bank/AdminBankView";

export const dynamic = "force-dynamic";

export default async function AdminBankPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="ZekerFlex Bank-beheer is alleen voor platformbeheerders." />;
  }
  const period = resolvePeriod("30");
  const entries = await safe(() => prisma.bankEntry.findMany({ where: { createdAt: { gte: period.from } }, select: { amountCents: true, createdAt: true }, take: 20_000 }), []);
  return (
    <AdminBankView
      chart={
        <Panel title="Geldstromen" subtitle="Bij en af op alle rekeningen, de laatste 30 dagen">
          <Chart
            title="Geld dat binnenkwam en uitging per dag"
            kind="line"
            unit="money"
            labels={timelineKeys(period)}
            series={[
              { label: "Bij", values: bucketSum(entries.filter((e) => e.amountCents > 0), (e) => e.createdAt, (e) => e.amountCents, period), slot: 1 },
              { label: "Af", values: bucketSum(entries.filter((e) => e.amountCents < 0), (e) => e.createdAt, (e) => -e.amountCents, period), slot: 2 },
            ]}
            height={190}
            emptyText="Nog geen boekingen in de laatste 30 dagen."
          />
        </Panel>
      }
    />
  );
}
